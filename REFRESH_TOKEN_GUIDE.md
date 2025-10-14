# Guía de Refresh Tokens para Empresas

## Descripción
Se ha implementado un sistema de refresh tokens para las empresas que permite mantener la sesión activa cuando el access token expira, mejorando la experiencia del usuario sin necesidad de hacer login constantemente.

## Características Implementadas

### 1. Modelo de Datos
- Se agregó el campo `refresh_token` al modelo Company
- Los refresh tokens se almacenan en la base de datos para validación

### 2. Generación de Tokens
- **Access Token**: Expira en 1 hora
- **Refresh Token**: Expira en 7 días
- Ambos tokens se generan en login y registro

### 3. Endpoints Disponibles

#### POST `/companies/login`
Genera ambos tokens al hacer login exitoso.

**Respuesta:**
```json
{
  "data": {
    "id": "company_id",
    "name": "Nombre Empresa",
    "email": "email@empresa.com",
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### POST `/companies/refresh-token`
Renueva el access token usando el refresh token.

**Headers:**
```
Authorization: Bearer <access_token_actual>
x-refresh-token: <refresh_token>
```

**O en el body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Respuesta:**
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### POST `/companies/logout`
Invalida el refresh token, cerrando la sesión.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Respuesta:**
```json
{
  "message": "Logout exitoso"
}
```

### 4. Manejo de Errores

#### Token Expirado
Cuando el access token expira, el middleware devuelve:
```json
{
  "error": "Token expirado",
  "code": "TOKEN_EXPIRED",
  "message": "El access token ha expirado. Usa el refresh token para obtener uno nuevo."
}
```

#### Refresh Token Inválido
```json
{
  "error": "Refresh token inválido o revocado"
}
```

## Flujo de Uso Recomendado

### 1. Login Inicial
```javascript
const response = await fetch('/companies/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { access_token, refresh_token } = await response.json();

// Guardar ambos tokens
localStorage.setItem('access_token', access_token);
localStorage.setItem('refresh_token', refresh_token);
```

### 2. Manejo de Requests
```javascript
const makeRequest = async (url, options = {}) => {
  const accessToken = localStorage.getItem('access_token');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    const error = await response.json();
    
    if (error.code === 'TOKEN_EXPIRED') {
      // Intentar refrescar el token
      const refreshed = await refreshAccessToken();
      
      if (refreshed) {
        // Reintentar la request original
        return makeRequest(url, options);
      } else {
        // Redirigir al login
        window.location.href = '/login';
      }
    }
  }

  return response;
};
```

### 3. Función de Refresh
```javascript
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  
  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch('/companies/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-refresh-token': refreshToken
      }
    });

    if (response.ok) {
      const { access_token, refresh_token: newRefreshToken } = await response.json();
      
      // Actualizar tokens
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', newRefreshToken);
      
      return true;
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
  }

  return false;
};
```

### 4. Logout
```javascript
const logout = async () => {
  const accessToken = localStorage.getItem('access_token');
  
  if (accessToken) {
    await fetch('/companies/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  }

  // Limpiar tokens locales
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  
  // Redirigir al login
  window.location.href = '/login';
};
```

## Seguridad

- Los refresh tokens se almacenan en la base de datos y se validan en cada uso
- Al hacer logout, el refresh token se invalida inmediatamente
- Cada vez que se usa el refresh token, se genera uno nuevo (rotación de tokens)
- Los tokens expiran automáticamente según su configuración

## Consideraciones

- El frontend debe manejar la renovación automática de tokens
- Es recomendable implementar un interceptor en las requests HTTP
- Los tokens deben almacenarse de forma segura (localStorage, sessionStorage, o cookies httpOnly)
- Considerar implementar un timeout para requests automáticos de refresh para evitar loops infinitos
