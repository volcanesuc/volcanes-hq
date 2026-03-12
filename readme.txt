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

