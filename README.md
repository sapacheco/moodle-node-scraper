# Moodle downloader helper
Script para descargar cursos de Moodle de manera automática. 

Este tipo de programas se denominan "scripts", por lo que no es necesario hacer una instalación, sin embargo, es necesario realizar ciertas configuraciones.

Este script encuentra programado en Javascript, corre sobre NodeJS y utiliza Puppeteer.

## **Características**
- Descargar los cursos de forma completa....
- Autoacomodar...
- Generar registro de lo descargado...

## Requisitos
- Sistemas operativos soportados: _Windows 10_, _Ubuntu_, _Linux Mint_.
- Es necesario que instales [NodeJS](https://nodejs.org/es/) en tu sistema operativo.
- Para el caso de Windows 10, el script debe ejecutarse desde _Powershell_. Para saber si lo tenés instalado, abrí el menú inicio y escribí _powershell_ en la caja de búsqueda. Si el programa se encuentra instalado, aparecerá entre los resultados de busqueda, caso contrario, lo tendrás que [instalar](https://answers.microsoft.com/es-es/windows/forum/all/c%C3%B3mo-instalar-powershell-en-windows-10/eafc6661-a558-4309-a7b1-5f6fa5ecb750).

## Instalación
1. [Descargar](www.google.com) la última release del programa, y extraerla a una carpeta a elección en tu computadora.
2. Abrir una terminal (Linux) o Powershell (Windows) en el directorio donde fué extraído el script. Ejecutar:
```js
npm install
```
3. Esperar a que se terminen de descargar todos los paquetes necesarios. Esta operación será necesario realizarla esta única vez.

## Uso
Ejecutar el script desde una Terminal (Linux) o desde Powershell (Windows 10)


## Errores conocidos
El programa se encuentra en fase de pruebas (beta), por lo que mucho del manejo de errores aún no fué implementado.


## FAQ
**P: ¿Por qué?**
Facultad... no para uso general

**P: ¡El programa es muy pesado!**

Hice un intento con curl, o wget. Realmente no recuerdo bien. La cuestión es que se mezclaba todo... no formaba carpetas, la autenticación y demas cuestiones era algo engorroso.. etc.. No era flexible. Aunque era muy liviando... elecciones...

**P: ¿Mantenimiento y nuevas características?**

Dispongo de poco tiempo libre, mantener o extender las funcionalidades de este programa no está muy arriba de mi lista de prioridades, ¡pero cualquier contribución es bienvenida! Sentite libre de clonar el repositorio y hacer alguna pull-request.

**P: ¿Transformarlo a algún ejecutable?**

Es sabido que hay personas que prefieren un programa con interfaz de usuario, y no ejecutar un script... pero
