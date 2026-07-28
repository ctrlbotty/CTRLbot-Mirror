# Build resources

electron-builder reads this folder (`buildResources` in `electron-builder.yml`).

Drop in when you have artwork:

| File | Used for |
| --- | --- |
| `icon.ico` | App icon and installer icon. 256×256 minimum; include 16/32/48/64/128/256 sizes. |
| `installerIcon.ico` | Installer-only icon, if you want it different from the app's. |
| `installerHeader.bmp` | NSIS header image, 150×57. |
| `installerSidebar.bmp` | NSIS welcome/finish sidebar, 164×314. |

Without `icon.ico` the build still succeeds — it just ships the default Electron icon.
