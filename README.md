# Jelen Tenka

**Verlo en vivo:** [jelentenka.com](https://jelentenka.com) · **Cómo se hizo:** [jelentenka.com/guia](https://jelentenka.com/guia/)

El monumento del **Parque Ecológico Jelen Tenka** (Santo Domingo de los Tsáchilas, Ecuador), convertido en una escena 3D que se recorre en el navegador.

Es el rostro de una mujer que mira al cielo, con un manto de mosaico y plantas vivas, un collar de cuentas rojas y dos manos gigantes que salen del césped. Alrededor están el parque, la feria, la gente, la ciudad y la cordillera, con ciclo de día y noche, clima y sonido.

Está hecho con **Three.js y JavaScript puro**. Todo es procedural: no hay modelos 3D ni fotos. La geometría se construye en código, las texturas se dibujan en `<canvas>` y el ambiente sonoro se sintetiza en vivo con Web Audio.

## Cómo correrlo

Necesitas [Node.js](https://nodejs.org) 20 o más reciente.

```bash
npm install
npm run dev        # servidor de desarrollo en tu computadora
npm run build      # versión para publicar, en dist/
npm run preview    # sirve lo que quedó en dist/
```

La carpeta `dist/` es estática. Se puede subir tal cual a GitHub Pages, Netlify, Vercel o cualquier hosting (usa rutas relativas gracias a `base: './'`).

## Qué se puede hacer

- **Mirar:** arrastra para rodear el monumento y usa la rueda para acercarte.
- **Pasear a pie:** en tercera persona con el caminante o en primera persona (tecla **V**). Se camina con **W A S D** y se puede subir al mirador por la escalera de la mano derecha.
- **Busca los detalles:** 14 pequeñas historias del lugar y de la cultura tsáchila.
- **Hora y clima:** despejado, parcial, nublado, lluvia, tormenta y niebla, con el sol ecuatorial (amanece hacia las 6:05 y anochece hacia las 18:15).
- **Sonido:** aves, chicharras, ranas, lluvia y viento sintetizados, y una marimba generativa en re mayor. Arranca con el primer clic.

### Parámetros de URL

| Parámetro | Efecto |
|---|---|
| `?hour=16.5` | Hora fija |
| `?weather=clear\|partly\|cloudy\|rain\|storm\|fog` | Clima |
| `?walk` o `?walk=stair` | Empieza paseando (o al pie de la escalera) |
| `?detail=rostro` | Abre una historia |
| `?seek` | Muestra los marcadores de detalles |
| `?panel` | Abre el panel de hora, clima y sonido |
| `?capture` | Sin pantalla de carga ni vuelo de entrada (para capturas) |

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/main.js` | Orquestador: renderer, luces, cámara, modos (vista general y paseo), panel y bucle |
| `src/monument.js` | El monumento: rostro esculpido con matemática, manto, pecho, collar, manos y mirador |
| `src/park.js` | Letras JELEN TENKA, césped, caminos, palmeras, ciudad, bosque y cordillera |
| `src/life.js` | Circuito de cuerdas, juegos, feria con noria y la gente |
| `src/guide.js` | El caminante, un hombre tsáchila tallado en arcilla |
| `src/details.js` | "Busca los detalles" |
| `src/atmosphere.js`, `sky.js`, `clouds.js`, `effects.js` | Luz por hora, clima, cielo, nubes, lluvia y luciérnagas |
| `src/flora.js`, `textures.js` | Vegetación con viento y texturas dibujadas en canvas |
| `src/audio.js` | Motor de sonido con Web Audio |
| `src/walker.js` | Caminar en primera persona y colisiones |
| `public/guia/` | La guía: imágenes de referencia y prompts para que tu IA te explique el proyecto |
| `public/sounds/` | Notas de marimba y sonidos sueltos |
| `tools/make-sounds.sh` | Regenera las notas de marimba con [earshot](https://github.com/Leonxlnx/earshot) (opcional) |

## Créditos

- [Three.js](https://threejs.org) (MIT) y [Vite](https://vite.dev) (MIT).
- Sonidos sueltos creados con [earshot](https://github.com/Leonxlnx/earshot) (MIT).
- Fuentes Fraunces, DM Sans y DM Mono, de Google Fonts (SIL Open Font License).

El monumento real es obra pública del Parque Ecológico Jelen Tenka. Esta escena es una interpretación libre hecha con código, con respeto por el pueblo tsáchila («tsáchila: verdadera gente»), y no tiene relación oficial con el parque ni con el municipio.

## Licencia

El código está bajo la licencia [MIT](LICENSE).
