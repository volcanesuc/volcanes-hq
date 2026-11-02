Author: 		Diego Rivera
Contact: 		diegorifu22@gmail.com

Root content:

index.html - landing page
dashboard.html - home landing after login page
association.html - tab that shows all info about association [subscription plans, members, memberships, payments]
trainings.html - tab that show the list of trainings done by team
attendance.html - tab to check kpis related to attendance on trainings
roster.html - list of all the players* of the team
tournaments.html - list of tournaments team is going to - includes track of payments
playbook.html - list of drills and training plans to be done on training day
public/tournament_info.html - landing goes here if tournament info button is clicked, shows info about this tournament hosted by team

Tasks en Codigo:

- Actualizar el CNAME file, favicon.ico
- Look and feel para el archivo de strings.js y config.js


Tasks en Firebase:

- Database:
crear club_config collection con index_settings y public_registration
crear index: trainings: {up} clubId, {down} date, {down} __name__
crear index: community_posts: {up} clubId, {down} createdAt, {down} __name__

- Authentication:
habilitar el google sign in y el anonymous
en settings autorizar dominios apropiados

- Remote Config:
crear el header tabs config file para mostrar/ocultar los tabs en el header
js\config\page-config.js es el otro file donde seteamos los tabs del header
strings.js tambien lleva los tabs ahi (refactor pendiente)

- Storage:
habilitar el storage SI se usa la seccion de asociación
agregar reglas para poder subir hero image

DNS:
- agregar CNAMEs para www.subdomain y subdomain

Google Cloud Storage:
- agregar un auth2.0 con el url del subdominio


Pickups (v2):

- Firestore rules: en las reglas actuales BORRAR las secciones "PICKUPS" y
  "PICKUP REGISTRATIONS" y pegar en su lugar firebase/firestore.pickups.rules
- Storage rules: reemplazar TODAS las reglas de Storage por firebase/storage.rules
- Authentication: habilitar "Anonymous" (lo usan los invitados sin cuenta)
- Entrar a Pickups > Ajustes y guardar una vez (crea club_config/pickups):
  zona horaria, SINPE, tarifas por defecto, canchas, textos
- Pickups viejos: apenas se publiquen las reglas, entrar a Pickups como admin.
  La página convierte sola los pickups e inscripciones anteriores al formato nuevo
  (mueve correo/teléfono/comprobante a /private y agrega la hora límite)
- Textos: js/strings/pickups_strings.js (default) + Ajustes > Textos (por club)
- Páginas públicas: /public/pickups.html (qué es + calendario + preguntas) y
  /public/pickup_policy.html (cancelación y reembolsos). Sus textos largos y el WhatsApp de
  contacto se editan en Pickups > Ajustes > "Páginas públicas y contacto"
  (en una tarjeta o pregunta, poner "-" en Textos la oculta)

Textos de toda la app (por club)
- Admin > Textos (o Pickups > Ajustes): cambiá cualquier texto; se guarda en club_config/texts
  (las reglas de club_config ya permiten leer a todos y escribir a admins, no hay que cambiar nada)
- Defaults: HTML con data-tx="html_<pagina>.<llave>" (el texto del HTML es el default)
  y JS en js/strings/screens/<pantalla>.js (TX.llave, txf(TX.llave, { variables }))
- Pantalla nueva: importar su archivo de textos en js/strings/all_strings.js y, si tiene data-tx,
  agregar el HTML a HTML_SOURCES
- Los textos se guardan en cache 10 min en el navegador; después de guardar, recargá la página
