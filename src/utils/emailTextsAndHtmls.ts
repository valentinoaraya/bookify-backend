export const emailConfirmAppointmentUser = (user: string, service: string, company: string, location: string, date: string, time: string, appointmentID: string) => {

    const cancelUrl = `https://bookify-aedes.vercel.app/cancel/${appointmentID}`

    const htmlUser = `<h2>Turno confimado con éxito</h2>
    <p>Hola ${user.split(" ")[0]},</p> 
    <p>Te informamos que tu turno para <strong>${service}</strong> en <strong>${company}</strong> fue confirmado.</p>
    <p>Se te espera en <strong>${location}</strong> el día <strong>${date}</strong> a las <strong>${time} hs</strong>.</p>
    <p>Si no puedes asistir, puedes cancelarlo haciendo click en el siguiente botón:</p>
    <p>
      <a href="${cancelUrl}" 
         style="display:inline-block;padding:10px 15px;background-color:#d9534f;color:white;text-decoration:none;border-radius:5px;">
        Cancelar turno
      </a>
    </p>`

    const textUser = `Hola ${user.split(" ")[0]},\n 
    Te informamos que tu turno para ${service} en ${company} fue confirmado.\n
    Se te espera en ${location} el día ${date} a las ${time} hs.
    Si no puedes asistir, cancélalo en el siguiente enlace: ${cancelUrl}`

    return { htmlUser, textUser }
}

export const emailConfirmAppointmentCompany = (company: string, service: string, user: string, date: string, time: string) => {
    const htmlCompany = `<h2>Tienes un nuevo turno</h2>
    <p>${company},</p>
    <p>Te informamos que <strong>${user}</strong> ha agendado un nuevo turno para <strong>${service}</strong>.</p>
    <p>El turno fue agendado para el día <strong>${date}</strong> a las <strong>${time} hs</strong>.</p>
    <p>Puedes ver la información completa en el panel "Próximos turnos" en Bookify.</p>`

    const textCompany = `${company},\n
    Te informamos que ${user} ha agendado un nuevo turno para ${service}.\n
    El turno fue agendado para el día ${date} a las ${time} hs.\n
    Puedes ver la información completa en el panel "Próximos turnos" en Bookify.`

    return { htmlCompany, textCompany }
}

export const emailCancelAppointmentUser = (company: string, user: string, service: string, date: string, time: string) => {
    const htmlUser = `<h2>Turno cancelado</h2>
    <p>Hola ${user.split(" ")[0]},</p> 
    <p>El turno que tenías para <strong>${service}</strong> en <strong>${company}</strong> se ha cancelado correctamente.</p>
    <p>En caso de que hayas abonado una seña para este turno, te hemos devuelto el 50% del dinero.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`

    const textUser = `Hola ${user.split(" ")[0]},\n
    El turno que tenías para ${service} en ${company} se ha cancelado correctamente.\n
    En caso de que hayas abonado una seña para este turno, te hemos devuelto el 50% del dinero.\n
    El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.`

    return { htmlUser, textUser }
}

export const emailCancelAppointmentCompany = (company: string, user: string, service: string, date: string, time: string) => {
    const htmlCompany = `<h2>Un turno ha sido cancelado</h2>
    <p>${company},</p>
    <p>El usuario <strong>${user}</strong> ha cancelado el turno que tenía para <strong>${service}</strong>.</p>
    <p>En caso de que cobres una seña en este servicio, se le ha devuelto el 50% de la misma al usuario.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`

    const textCompany = `${company},\n
    El usuario ${user} ha cancelado el turno que tenía para ${service}.\n
    En caso de que cobres una seña en este servicio, se le ha devuelto el 50% de la misma al usuario.\n
    El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.`

    return { htmlCompany, textCompany }
}

export const emailDeleteAppointmentUser = (company: string, user: string, service: string, date: string, time: string) => {
    const htmlUser = `<h2>Tu turno ha sido cancelado</h2>
    <p>Hola ${user.split(" ")[0]},</p> 
    <p>El turno que tenías para <strong>${service}</strong> ha sido cancelado por <strong>${company}</strong>.</p>
    <p>En caso de que hayas abonado una seña para este turno, te hemos devuelto la totalidad del dinero.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`

    const textUser = `Hola ${user.split(" ")[0]},\n
    El turno que tenías para ${service} ha sido cancelado por ${company}.\n
    En caso de que hayas abonado una seña para este turno, te hemos devuelto la totalidad del dinero.\n
    El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.`

    return { htmlUser, textUser }
}

export const emailDeleteAppointmentCompany = (company: string, user: string, service: string, date: string, time: string) => {
    const htmlCompany = `<h2>Turno cancelado</h2>
    <p>${company},</p>
    <p>El turno que <strong>${user}</strong> tenía para <strong>${service}</strong> ha sido cancelado correctamente.</p>
    <p>En caso de que cobres una seña en este servicio, se le ha devuelto la totalidad del dinero al usuario.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`

    const textCompany = `${company},\n
    El turno que ${user} tenía para ${service} ha sido cancelado correctamente.\n
    En caso de que cobres una seña en este servicio, se le ha devuelto la totalidad del dinero al usuario.\n
    El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.`

    return { htmlCompany, textCompany }
}