# Publicar FitCoach Casa en Android y iOS

La app es una **PWA** (funciona offline, se instala desde el navegador). Para llevarla a
las tiendas se empaqueta la misma PWA en un contenedor nativo. **No hay que reescribir la app.**

> Lo que solo puedes hacer tú (requiere cuentas, pago, firma y, en iOS, un Mac): crear las
> cuentas de desarrollador, firmar los binarios y subirlos. Todo lo del repo ya está listo.

---

## 0. Requisitos de cuentas (una vez)
- **Google Play:** cuenta de Google Play Console — **25 USD pago único**. https://play.google.com/console
- **Apple App Store:** Apple Developer Program — **99 USD/año** + un **Mac con Xcode**. https://developer.apple.com/programs/

---

## 1. Android (Google Play) — vía TWA con PWABuilder  ✅ camino recomendado

Una TWA (Trusted Web Activity) abre tu PWA a pantalla completa, sin barra de navegador.

1. Ve a **https://www.pwabuilder.com** e introduce `https://bio-coach.vercel.app`.
2. Revisa el informe (icono, manifest, service worker) — debería puntuar bien.
3. **Package For Stores → Android → Google Play** y descarga el paquete. Genera:
   - `app-release-signed.aab` (lo que subes a Play)
   - la **clave de firma** (`signing.keystore`) + un `assetlinks.json` con el **SHA-256** de esa clave. **Guarda la clave con tu vida** (sin ella no puedes actualizar la app).
4. Copia el `sha256_cert_fingerprints` que te da PWABuilder dentro de
   [`.well-known/assetlinks.json`](.well-known/assetlinks.json) de este repo (reemplaza el placeholder),
   ajusta también `package_name` si PWABuilder usó otro, y vuelve a desplegar en Vercel.
   - Verifica que sea accesible: `https://bio-coach.vercel.app/.well-known/assetlinks.json`
   - Esto elimina la barra de URL dentro de la app (verificación de dominio).
5. En **Play Console:** crea la app → sube el `.aab` en un release (empieza por *Testing interno*),
   completa ficha (nombre, descripción, capturas, icono 512), política de privacidad y
   el cuestionario de contenido. Revisa y publica.

Alternativa CLI (más control): **Bubblewrap** (`npm i -g @bubblewrap/cli`, `bubblewrap init --manifest https://bio-coach.vercel.app/manifest.json`, `bubblewrap build`). Necesita JDK 17 + Android SDK.

### Permiso de cámara en Android
La TWA hereda los permisos del navegador (Chrome). `getUserMedia` funciona sobre HTTPS.
La primera vez pedirá permiso de cámara igual que en la web. No requiere config extra.

---

## 2. iOS (App Store)

iOS no tiene TWA. Dos opciones:

### 2a. PWABuilder → paquete iOS  (rápido)
- En PWABuilder, **Package For Stores → iOS**. Descarga un proyecto Xcode que envuelve la PWA en `WKWebView`.
- Ábrelo en **Xcode** (Mac), pon tu *Team* de firma, `bundle id` (p. ej. `app.vercel.bio-coach`), icono y capturas.
- Sube con Xcode/Transporter a **App Store Connect** → completa ficha → envía a revisión.

### 2b. Capacitor (más nativo, recomendable si 2a es rechazado)
```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "FitCoach Casa" app.vercel.biocoach --web-dir .
npx cap add ios
npx cap open ios   # abre Xcode
```
- En `capacitor.config` puedes apuntar `server.url = "https://bio-coach.vercel.app"` (carga la web en vivo)
  o empaquetar los archivos locales (offline).

### ⚠️ Cámara en iOS (importante)
- `getUserMedia` en `WKWebView` funciona desde **iOS 14.3+**.
- Debes declarar en `Info.plist` la clave **`NSCameraUsageDescription`** con un texto del tipo
  *"Se usa la cámara para analizar tu técnica de ejercicio en tu dispositivo; el vídeo no sale del teléfono."*
  Sin esto, Apple rechaza la app y la cámara falla.

### ⚠️ Riesgo de rechazo (Guideline 4.2 – "Minimum Functionality")
Apple suele rechazar apps que son "solo un envoltorio de una web". FitCoach tiene buen argumento
(análisis biomecánico por cámara en el dispositivo, funciona offline como PWA), pero para reducir el
riesgo conviene añadir algo nativo: **notificaciones push locales** (recordatorio de entrenar),
integración con **Apple Health**, o pantalla de inicio nativa. Capacitor (2b) facilita añadir esto.

---

## 3. Assets de tienda que necesitarás (los dos stores)
- **Icono** 512×512 (PWABuilder lo genera desde `icon.svg`).
- **Capturas de pantalla**: teléfono (mín. 2–3). Puedes tomarlas de la app real en el móvil.
- **Descripción corta y larga**, categoría (Salud y fitness), idioma (es).
- **Política de privacidad** (URL pública). Punto fuerte real: *"el vídeo se procesa en el
  dispositivo y nunca se sube"* — decláralo en la ficha de privacidad de datos de ambas tiendas.

---

## 4. Checklist de "listo para tienda" (estado del repo)
- [x] Manifest válido con `id`, `scope`, `display`, `theme_color`, icono maskable.
- [x] Service worker (offline) — `sw.js`.
- [x] HTTPS en producción (Vercel).
- [x] `.well-known/assetlinks.json` (plantilla — falta pegar tu SHA-256 de firma).
- [ ] Cuenta Play (25 USD) / Apple (99 USD + Mac).
- [ ] `.aab` firmado (PWABuilder/Bubblewrap) subido a Play.
- [ ] Proyecto iOS firmado (Xcode) subido a App Store Connect + `NSCameraUsageDescription`.

---
Resumen: **Android es directo** (PWABuilder + Play, ~1–2 h de trabajo tuyo). **iOS necesita un Mac**
y cuidar el permiso de cámara y la guía 4.2. El código de la app no cambia en ningún caso.
