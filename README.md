# Paneles ST — MP Ascensores

Dos paneles HTML autocontenidos (sin backend propio) para seguimiento de incentivos del equipo técnico, 2026-S2:

- `objetivos-st-2026.html` — consecución de objetivos por técnico. Trae los datos en vivo desde la API de Zendesk/n8n en Railway (`https://zendesk-tecnicos-production.up.railway.app`); si esa API no responde, el panel sigue funcionando mostrando solo los objetivos definidos, sin resultados.
- `calidad-tickets-mp.html` — auditoría mensual de calidad de tickets cerrados, con la rúbrica de evaluación y las notas de formación. No necesita ninguna API externa: todos los datos están dentro del propio archivo.
- `index.html` — página de entrada con enlaces a los dos paneles.

Ambos tienen selector de idioma ES/EN integrado (arriba a la derecha).

## Cómo se sirve

Es un sitio 100% estático. En este repo se despliega en Railway con un servidor mínimo (`serve`, ver `package.json`): Railway detecta el proyecto Node, instala dependencias y arranca `npm start`, que sirve todos los `.html` tal cual están en la raíz del repo.

## Cómo actualizar un panel

1. Sustituye el archivo `.html` correspondiente en este repo por la versión nueva (mismo nombre).
2. Sube el cambio a GitHub — a mano desde "Add file → Upload files" en la web de GitHub, o con `git add . && git commit -m "..." && git push` si trabajas con git.
3. Railway está conectado a este repositorio: en cuanto detecta el push a la rama principal, vuelve a desplegar automáticamente. En unos 30-60 segundos la URL pública ya sirve la versión nueva.

No hace falta tocar nada en Railway para actualizar contenido — solo en caso de cambiar cómo se sirve el sitio (por ejemplo, si se añadiera un backend propio).
