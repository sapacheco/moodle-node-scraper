// IMPORTACIÓN DE MÓDULOS
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const sanitize = require("sanitize-filename");
const path = require('path');
const request = (require('request')).defaults({jar: true}); // ESTA OPCIÓN SE HABILITA PARA PERMITIR DESCARGAS CON COOKIES DE SESION
const progress = require('request-progress');
const term = require('terminal-kit').terminal;
const cheerio = require('cheerio');


// PARÁMETROS
const _defaults = JSON.parse(fs.readFileSync("defaults.json"));
const _config = Object.assign(_defaults, JSON.parse(fs.readFileSync("configuracion.json")));
const _personalData = JSON.parse(fs.readFileSync("datos-personales.json"));
// TODO: Preveer errores al procesar estos archivos
// TODO: AUN NO PROGRAMADO 🤖: const _enumerarCarpetasDescargadas = true; // [bool, def: true]. Agregar un número a cada nombre de carpeta según su disposición en el aula virtual.


// FUNCIONES DE SOPORTE
/*const retry = (fn, ms) => new Promise(resolve => {
	fn()
		.then(resolve)
		.catch(() => {
			setTimeout(() => {
				console.log('retrying...');
				retry(fn, ms).then(resolve);
			}, ms);
		})
});

b = 1;
a = retry(function() {
    return new Promise (function (resolve, rej) {
        setTimeout(() => {
                intento = +(Math.random()*5).toFixed(0);
                console.log(intento)
                if(intento == b) resolve(intento); 
                else rej(intento)
        }, 1000);
    }).then(intento).catch()
}, 3000)
*/


// -------------------------------------------------------------------------------------------------
//						 	FUNCIONES RELACIONADAS AL MENU DE OPCIONES
// -------------------------------------------------------------------------------------------------
async function launchMenu () {
	term.clear();
	term.brightBlue.bold('\nBienvenido, ¿que desea hacer?\n') ;
	var items = [
		'» Descargar un curso de mi cuenta de Moodle  ',
		'» Configurar esta utilidad  ',
		'» Acerca de esta utilidad  ',
		'» Salir  '
	];
	
	var opcionElegida = await term.singleColumnMenu(items, {leftPadding: "    "}).promise;
	term.grabInput(false);
	switch (opcionElegida.selectedIndex) {
		case 0:
			await descargarCurso();
			await launchMenu();
			break;
		case 1:
			await launchMenu();
			break;
		case 2:
			await printAbout();
			await launchMenu();
			break;
		case 3:
			term.processExit();
			process.exit();
			break;
		default:
			console.log("Opción no permitida.");
	}
}

async function printAbout () {
	term.clear();
	term.brightBlue.bold("\nInformación acerca de este programa.\n\n");	
	term.bold("    Desarrollador:").strike(" Sergio Pacheco (sergioarielpacheco@gmail.com).\n\n");
	term.bold("    Descripción del programa:").strike(" --completar--.\n\n");
	term.bold("    Renuncia de responsabilidad:").strike(" --completar--.\n\n");
	term.bold("    Licencia:").strike(" --completar--.\n\n");
	term.bold("    Versión:").strike(" --completar--.\n\n");
	await term.singleColumnMenu(['» Volver al menu principal  '], {leftPadding: "    "}).promise;
}


// -------------------------------------------------------------------------------------------------
//						 	FUNCIONES RELACIONADAS A DESCARGAR UN CURSO
// -------------------------------------------------------------------------------------------------
async function launchPuppeteer () {
	// INICIAR EL NAVEGADOR MARIONETA Y ABRIR
	// Y CONFIGURAR UNA NUEVA PAGINA/PESTAÑA
	console.info("\n▪ DESCARGANDO CURSO\n");
	const browser = await puppeteer.launch({
		headless: _config.puppeteer_headless, // FALSE: MUESTRA EL NAVEGADOR MARIONETA
		args: [`--window-size=${_config.puppeteer_window_width},${_config.puppeteer_window_height}`]
	}); 
	process.on('unhandledRejection', (reason, p) => {
		console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
		console.error('\n  ✖ Se produjo un error: Rechazo de promesa no manejado.');
		console.info("\n▪ OPERACIÓN FINALIZADA\n");
		browser.close();
	});
	let page = await browser.newPage();
	await page.setCacheEnabled(true); // TODO: Es mejor false?...
	return page;
}


async function connectToMoodle (puppeteerPage) {
	// CONECTAR CON EL SITIO (aula virtual)
	// Y ESPERAR A LA CARGA DEL CONTENIDO.
	// TRAS LA CONEXIÓN, DEVUELVE LA COOKIE DEL SITIO.
	try {
		console.info("  ▪ Intentando conectarse con el aula virtual...");
		await puppeteerPage.goto(_personalData["login-url"], { waitUntil: 'networkidle2' });
		var navigationCookie = await puppeteerPage.cookies(); // ALMACENAMOS UNA COPIA DE LA COOKIE ANTES DEL LOGIN
		term.brightGreen("  ✓ Conexión establecida.\n\n");
		return navigationCookie;
	} catch (error) {
		// console.log(error);
		console.error("  ✖ No fué posible conectarse con el aula virtual.\n"); // SE PUEDE DEBER POR EJEMPLO A QUE NO HAYA BUENA CONEXION A INTERNET O QUE EL SERVICIO NO ESTÉ DISPONIBLE
		term.processExit();
		process.exit();
		browser.close();
	}
}


// PROCESO DE LOGIN EN EL SITIO: SE SIMULA EL 
// TIPEO DEL NOMBRE DE USUARIO, LA CONTRASEÑA
// Y EL CLICK EN EL BOTON DE INICIO DE SESION.
// ANTES DE HACER CLICK EN DICHO BOTON HAY QUE
// ESPERAR ALGUN TIEMPO (POR EJEMPLO 1 SEGUNDO)
// PORQUE, CASO CONTRARIO, EL LOGIN NO FUNCIONA.
// ESTO LO DESCUBRI POR PRUEBA Y ERROR.
async function tryMoodleLogin (puppeteerPage, cookieBeforeLogin) {


	// PERMITIMOS QUE EL USUARIO INTRODUZCA SU NOMBRE
	// Y CONTRASEÑA DIRECTAMENTE DESDE LA TERMINAL
	term.brightBlue.bold("  » Introduzca su nombre de usuario de Moodle: ") ;
	var user = await term.inputField().promise;
	term.brightBlue.bold("\n  » Introduzca su contraseña de Moodle: ") ;
	var pass = await term.inputField({echoChar: true}).promise;
	term.grabInput(false);



	await puppeteerPage.type('#username', user);
	await puppeteerPage.type('#password', pass);
	await puppeteerPage.waitFor(1000);
	console.info("\n\n  ▪ Iniciando sesión en la cuenta...");
	await Promise.all([
		puppeteerPage.click('#loginbtn'),
		puppeteerPage.waitForNavigation({waitUntil: 'networkidle2'})
	]);
	var loginCookie = await puppeteerPage.cookies();


	// SI LAS COOKIES DE SESION SON DIFERENTES ANTES Y DESPUES DEL LOGIN, 
	// SIGNIFICA QUE FUE REALIZADO CON EXITO, CASO CONTRARIO, SERAN IGUALES.
	if (loginCookie[0].value !== cookieBeforeLogin[0].value) {
		term.brightGreen("  ✓ Autenticación concedida.\n\n");
		
		/* TODO: Terminar esto....
		term.brightBlue.bold("  » ¿Quisieras guardar tus datos de inicio\n");
		term.brightBlue.bold("    de sesión para futuras ocasiones? [S|n]\n");
		var almacenarDatosLogin = await term.yesOrNo({yes: ['s' , 'ENTER'] , no: ['n']}).promise;
		term.grabInput(false);
		console.log("    Respuesta: " + (almacenarDatosLogin ? "Si.\n" : "No.\n"));
		*/
		
		return loginCookie;
	} else {
		// console.error("  ⚠️ Se produjo un error en la autenticación, reintentando...\n");
		term.brightYellow("  ⚠️ Se produjo un error en la autenticación: Quizás\n");
		term.brightYellow("    el nombre de usuario o la contraseña ingresados\n");
		term.brightYellow("    sean incorrectos. Reintentando...\n\n");
		await tryMoodleLogin(puppeteerPage, cookieBeforeLogin);
	}
}


// ESTA FUNCION ES LA ENCARGADA DE INICIAR EL
// PROCESO DE SELECCION Y DESCARGA DE UN CURSO
// TODO: ¿SEGMENTAR ESTA MEGA FUNCION EN PARTES MAS CHICAS?
async function descargarCurso () {



	const page = await launchPuppeteer();
	var cookieBeforeLogin = await connectToMoodle(page);
	var cookieCorrectLogin = await tryMoodleLogin(page, cookieBeforeLogin);






	

	
	// UNA VEZ EN LA PAGINA DEL CURSO EN CUESTION
	// DEL CUAL SE QUIERE DESCARGAR LOS ARCHIVOS,
	// REALIZAMOS SCRAP DE LA INFORMACION DE LOS 
	// MISMOS (LINK DE DESCARGA, NOMBRE, SECCION,
	// ETC) Y LOS CARGAMOS EN UN ARRAY (sources)
	// QUE USAREMOS LUEGO PARA REALIZAR LA DESCARGA
	console.info("  ▪ Obteniendo lista de recursos disponibles para la descarga...");
	await page.goto(_personalData["curso-url"], {waitUntil: 'networkidle2'});
	await page.addScriptTag({path: 'jquery-3.2.1.min.js'}); // CARGA LOCAL, AUNQUE TAMBIEN PUEDE SER ONLINE: await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.2.1.min.js'});
	let sources = await page.evaluate((myConfig) => {
		
		
		// PARA USARLO: var color = randomColor.next().value;
		var randomColor = (function* mi_generadorColor () {
			var fracciones = 2;
			var fraccionActual = 0;
			var saltearUno = false;
			while(true) {
				yield "hsl(" + 360 * fraccionActual / fracciones + ", 30%, 50%, 0.5)";
				fraccionActual++;

				if(saltearUno === true)
				fraccionActual++;

				if (fraccionActual >= fracciones) {
					fraccionActual = 1;
					fracciones = fracciones * 2;
					saltearUno = true;
				}
			}
		})();


		// ELIMINAMOS LA PARTE QUE CONTIENE NUMEROS EN 
		// LA URL DE LOS DIFERENTES TIPOS DE RECURSOS
		// PORQUE ESTOS NÚMEROS CAMBIAN CONSTANTEMENTE
		// QUITANDOLE ROBUSTES AL PROGRAMA.
		var recursos_blackListTiposGenericos = myConfig.recursos_blackListTipos.map((i) => i.replace(/\/\d+(?=\/)/gi, ""));


		// ESTA FUNCION DETERMINA SI EL ARCHIVO
		// ACTUALMENTE ANALIZADO EN LA PAGINA DEBE
		// SER DESCARGADO O NÓ, EN BASE A LA LISTA
		// ANTERIORMENTE DEFINIDA (FILTRADO POR TIPO).
		// TAMBIEN ES POSIBLE HACER UN FILTRADO POR
		// NOMBRE DE ARCHIVO, AUNQUE POR AHORA NO ES
		// PRIORIDAD IMPLEMENTAR ESTO. HAY QUE TRABAJAR
		// UN POCO EL CODIGO COMENTADO RELACIONADO A ESO.
		function filter(index, item) {
			// FILTRADO DE NOMBRE DE ARCHIVOS - DESACTIVADO, ACONDICIONAR ANTES DE ACTIVAR
			//var WHITE_LIST = 'pdf Exercise Teil Präsentation Tutor Uebung Zusatz Übung Lösung Vorlesung Aufzeichnung Multiplizierer Klausur Tutorial History supplementary video pdfs interfaces'.toLowerCase().split(' '),
			//BLACK_LIST = 'Forum Gruppe Sprechstunden'.toLowerCase().split(' ');
			/*var txt = jQuery(item).text().toLowerCase();
			function reduceFn(isListed, current) {
				return isListed || ~txt.indexOf(current);
			}


			var blacklisted = BLACK_LIST.reduce(reduceFn, false);
			var whitelisted = WHITE_LIST.reduce(reduceFn, false);
			if (!whitelisted || blacklisted) console.error("BLACKLISTED:", txt);
			else console.log("WHITELISTED:", txt);
			return whitelisted && !blacklisted;*/

			
			// FILTRADO DE TIPOS DE ARCHIVOS
			var tipo = (jQuery(item).find("img").attr("src")).replace(/\/\d+(?=\/)/gi, ""); // ELIMINAMOS LA PARTE QUE CONTIENE NUMEROS CAMBIANTES EN LA URL
			if(recursos_blackListTiposGenericos.indexOf(tipo) === -1 ) {
				jQuery(item).css({
					"background": "#00ff1936",
					"border-radius": "5px",
					"padding": "5px 10px"
				});
			}
			return recursos_blackListTiposGenericos.indexOf(tipo) === -1;
		}


		// AQUI SE ANALIZAN UNO A UNO LOS ELEMENTOS DEL DOM
		// DE LA PAGINA A FIN DE ENCONTRAR LA INFORMACION
		// NECESARIA PARA LA DESCARGA. SE LEEN 3 VALORES:
		// EL TITULO DEL ARCHIVO (ASI COMO LO LISTA EL
		// AULA VIRTUAL), LA SECCION A LA QUE PERTENECE
		// Y EL LINK DE DESCARGA. TODO SE CARGA A UN ARRAY.
		var courseName = $(".page-header-headings").text();
		var color_subSection = randomColor.next().value;
		var sourceInfo = jQuery('body .instancename')
			.closest('a')
			.filter(filter)
			.map(function(index, item) {


				// OBTENCIÓN DE LA INFORMACIÓN BÁSICA DEL RECURSO
				var downloadLink = jQuery(item).attr('href').replace(/(^\s+|\s+$)/gi, ""); // ELIMINAMOS ESPACIOS EN BLANCO AL INICIO Y AL FINAL DEL STRING
				var sectionName = $(item).closest(".course-content ul li.section.main").css("border", "2px dashed green").attr("aria-label").replace(/(^\s+|\s+$)/gi, "");
				var fileName = ($(item).text()).replace(new RegExp($(item).find(".accesshide").text() + "$"), "").replace(/(^\s+|\s+$)/gi, ""); // QUITAMOS DEL NOMBRE LA PARTE CORRESPONDIENTE A UNA ETIQUETA OCULTA EN EL HTML Y ESPACIOS EN BLANCO AL INICIO Y AL FINAL DEL STRING
				

				// OBTENCIÓN DE LA SUBSECCIÓN A LA QUE PERTENECE EL RECURSO:
				// PARA HACERLO, SE TOMA UN ITEM, Y SE BUSCA SU ANTECESOR
				// A FIN DE OBSERVAR SI CORRESPONDE A OTRO ITEM O A UNA 
				// ETIQUETA SE SUBSECCIÓN. EN CASO DE QUE SEA UNA ETIQUETA, 
				// SE CAPTURA SU VALOR Y SE CORTA EL BUCLE. SI ESE NO ES 
				// EL CASO, SE SIGUE BUSCANDO HACIA ATRÁS EN LA MISMA SECCIÓN.
				// SI NO SE ENCUENTRA NINGUNA ETIQUETA EN TODA LA SECCIÓN,
				// SE DEJA SIN NOMBRE A LA SUBSECCIÓN. ESTO ES TAN ENREDADO
				// PORQUE EL MOODLE NO ORDENA LAS SUBSECCIONES POR PARENTESCO,
				// EN FORMA DE CONTENEDORES, SI NO QUE UBICA LAS ETIQUETAS COMO
				// UN ITEM MAS DE LA LISTA DE RECURSOS, AL MISMO NIVEL JERÁRQUICO.
				var subSectionName = "";
				var section_prev_name = "";
				var section_i_name = "";
				var itemEnLista_prev = $(item).closest(".activity"); // Valor inicial
				var itemEnLista_i = $(item).closest(".activity").next(); // Valor inicial
				do {
					itemEnLista_i = itemEnLista_prev;
					itemEnLista_prev = itemEnLista_i.prev();
					section_i_name = itemEnLista_i.closest(".course-content ul li.section.main").attr("aria-label");
					section_prev_name = itemEnLista_prev.closest(".course-content ul li.section.main").attr("aria-label");
					// itemEnLista_i.css("background-color", color_subSection); // COLOREA LOS NOMBRES DE ARCHIVO EN LA CAPTURA DE PANTALLA DEL SITIO SEGUN LA SUBSECCION A LA QUE PERTENEZCAN
					if (itemEnLista_prev.hasClass("modtype_label")) {
						subSectionName = itemEnLista_prev.text().replace(/(^\s+|\s+$)/gi, ""); // ELIMINAMOS ESPACIOS EN BLANCO AL INICIO Y AL FINAL DEL STRING;
						// itemEnLista_prev.css("background-color", color_subSection);
						color_subSection = randomColor.next().value;
						break;
					}
				} while (section_i_name === section_prev_name);


				// DEVOLVEMOS TODA LA INFORMACIÓN EN FORMA DE OBJETO
				return {
					fileLink: downloadLink,
					fileName: fileName,
					fileTitle: fileName,
					sectionName: sectionName,
					subSectionName: subSectionName,
					courseName: courseName,
					originalFileName: "", // SERÁ COMPLETADO LUEGO AL RECIBIR LA CABECERA DE LA DECARGA
					contentType: "", // SERÁ COMPLETADO LUEGO AL RECIBIR LA CABECERA DE LA DECARGA
					fileSize: null, // [Bytes] SERÁ COMPLETADO LUEGO AL RECIBIR LA CABECERA DE LA DECARGA
					isMoodleFolder_id: (downloadLink.split("id=").length > 1 && downloadLink.indexOf("folder") != -1) ? downloadLink.split("id=").slice(-1)[0] : null // [NUM] SI EL RECURSO EN CUESTION ES UNA CARPETA DEL MOODLE, SE ALMACENA AQUI SU NUM DE ID. CASO CONTRARIO, SE DEJA ESTE VALOR EN "null". ESTO SERÁ UTIL LUEGO PORQUE LAS CARPETAS SE DESCARGAN DE OTRA FORMA QUE LOS DEMAS RECURSOS.
				};
			})
			.toArray();
			console.table(sourceInfo);
		
		return sourceInfo;
	}, _config);
	term.brightGreen("  ✓ Total de archivos a descargar: " + sources.length + "\n\n");
	// console.info("  ✓ Total de archivos a descargar: " + sources.length + "\n");



	// ELIMINAMOS DEL NOMBRE CARACTERES QUE PUEDAN
	// CAUSAR CONFLITOS CON EL SISTEMA DE ARCHIVOS.
	// TAMBIÉN CREAMOS LA RUTA DONDE SE GUARDARA EL
	// ARCHIVO: "./descargas/Nombre_curso/Nombre_seccion/Nombre_subSeccion/archivo"
	sources = sources.map((i) => Object.assign(i, {
		fileName: sanitize(i.fileName, {replacement: "-"}), 
		fileTitle: sanitize(i.fileTitle, {replacement: "-"}), 
		sectionName: sanitize(i.sectionName, {replacement: "-"}),
		subSectionName: sanitize(i.subSectionName, {replacement: "-"})
	}));
	sources.forEach((i) => fs.ensureDirSync(path.join("descargas", i.courseName + " - Aula Virtual", i.sectionName, i.subSectionName))); 



	// REALIZAMOS UNA CAPTURA DE PANTALLA DE LA PAGINA COMO REGISTRO
	console.info("  ▪ Guardando una vista previa del curso...");
	try {
		await page._client.send('Emulation.clearDeviceMetricsOverride'); // PARA QUE EL ANCHO DE LA PAGINA SEA EL MISMO QUE EL DE LA VENTA DEL NAVEGADOR
		await page.screenshot({ path: './descargas/' + sources[0].courseName + ' - Aula Virtual/Contenido del curso.png', fullPage: true });
		await page.pdf({path: './descargas/' + sources[0].courseName + ' - Aula Virtual/Contenido del curso.pdf', format: 'A4', printBackground: true}); // TODO: Es util?
		term.brightGreen('  ✓ Guardada en ' + '"./descargas/' + sources[0].courseName + ' - Aula Virtual/Contenido del curso.png"\n\n'); // ESTO FUNCIONA SOLAMENTE CUANDO headless = true;
		// console.info("  ✓ Guardada en " + "./descargas/" + sources[0].courseName + " - Aula Virtual/Contenido del curso.png\n");
	} catch (e) {
		term.brightYellow("  ⚠️ Existieron algunos problemas, la operación pudo o nó haberse completada de forma correcta: " + e + "\n\n");
	}



	// ESTA FUNCIÓN DESCARGA SOLAMENTE LA INFORMACION DE
	// CABECERA DE LOS ENLACES CORRESPONDIENTES A CADA UNO
	// DE LOS RECURSOS. EL PROPÓSITO ES OBTENER INFORMACIÓN
	// ADICIONAL COMO LA EXTENSIÓN DEL NOMBRE DEL ARCHIVO Y
	// SU TAMAÑO. ESTO SERVIRÁ PARA TRABAJAR LUEGO CON EL 
	// SISTEMA DE ARCHIVOS.
	// POR OTRO LADO, EN EL MOODLE A VECES SUCEDE QUE LOS 
	// RECURSOS SON AGREGADOS NO COMO UN ENLACE DIRECTO, SI
	// NÓ QUE EL ENLACE DE LA PAGINA PRINCIPAL CONDUCE A OTRA
	// PAGINA WEB DONDE ESTA EMBEBIDO, O "INCRUSTADO", EL 
	// VERDADERO ARCHIVO. EN ESTE CASO LO QUE OBTENEMOS COMO
	// RESPUESTA DE LA PETICIÓN NO ES UN ARCHIVO, SI NÓ UN 
	// DOCUMENTO HTML. NOSOTROS QUEREMOS EL ARCHIVO, POR LO
	// QUE ES NECESARIO HACER UN PEQUEÑO PROCESAMIENTO DEL 
	// CUERPO DE LA RESPUESTA (EL CODIGO HTML) A FIN DE 
	// ENCONTRAR EL LINK DEL VERDADERO ARCHIVO (CASO 
	// CONTRARIO ESTARIAMOS DESCARGANDO SOLO EL HTML)
	function analizarRecursos() {


		// ESTA FUNCIÓN PROCESA CODIGO HTML PROVENIENTE
		// DE UNA PAGINA DE MOODLE DONDE SE ENCUENTRE
		// EMBEBIDO UN RECURSO, CON EL OBJETIVO DE 
		// EXTRAER EL LINK DEL MISMO
		function buscarRecursosEnHTML (htmlCode) {
			var $ = cheerio.load(htmlCode);
			var sourceLink = "";

			// VERIFICAMOS SI EXISTEN URLs EN LOS LUGARES
			// QUE ESPERAMOS QUE HAYAN (SON PLANTILLAS)
			if ($(".resourcecontent").length > 0) {
				// PDFs
				sourceLink = $(".resourcecontent").html().match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi)[0];
			
			} else if ($(".resourceworkaround").length > 0) {
				// OTROS RECURSOS
				sourceLink = $(".resourceworkaround").html().match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi)[0];
			
			} else if ($(".singlebutton > form:nth-child(1)").length > 0) {
				// CARPETAS (NOTA: Las carpetas vacias arrojarán un error, que ya está manejado en el código)
				sourceLink = $(".singlebutton > form:nth-child(1)").attr("action");
			
			} else if($(".urlworkaround").length > 0) {
				// Links
				sourceLink = $(".urlworkaround").html().match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi)[0];
			}
			
			// SI NO HAY COINCIDENCIA CON NINGUNA
			// DE LAS PLANTILLAS ANTERIORES
			if (sourceLink === null || sourceLink === "") {
				
				/* console.error("\t    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄");
				console.error("\t    ⚠️ Atención: No se pudo obtener la dirección del recurso. Se");
				console.error("\t    descargará una imagen con un símbolo  de 'error' en su lugar");
				console.error("\t    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀"); */

				term.brightYellow("\t    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄\n");
				term.brightYellow("\t    ⚠️ Atención: No se pudo obtener la dirección del recurso. Se\n");
				term.brightYellow("\t    descargará una imagen con un símbolo  de 'error' en su lugar\n");
				term.brightYellow("\t    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\n");

				sourceLink = "https://upload.wikimedia.org/wikipedia/commons/5/5f/Icon_Simple_Error.png"; // ESTE LINK CONDUCE A UNA IMAGEN DE ERROR, CON LICENCIA CC0 (DOMINIO PUBLICO). EL SCRIPT LA DESCARGARÁ EN LUGAR DEL RECURSO NO HALLADO.
			}

			// DEVOLVEMOS LA DIRECCIÓN DEL RECURSO
			// console.log(sourceLink);
			return sourceLink;
		}


		// DEVOLVEMOS UNA PROMESA CUANDO LLAMEN A LA FUNCIÓN.
		// SERÁ RESUELTA UNA VEZ QUE SEAN ANALIZADOS TODOS
		// LOS RECURSOS. LA EJECUCIÓN DEL PROGRAMA QUE ESTÁ
		// LUEGO DE LA LLAMADA A LA FUNCIÓN SE DETENDRÁ HASTA
		// QUE LA PROMESA SEA RESUELTA. ESTO ES LO PROPIO DEL 
		// MODO DE TRABAJO ASINCRÓNICO EN JS. UTILIZAMOS AWAIT
		// EN LA LLAMADA PARA ESPERAR EL CUMPLIMIENTO DE LA PROMESA.
		return new Promise(function(resolve, reject) {


			// ESTA FUNCIÓN INICIA LA DESCARGA DE LA INFORMACIÓN
			// DE CADA RECURSO Y PROCESA LA RESPUESTA. SE DECARGAN
			// SOLAMENTE SUS CABECERAS, SALVO CASO QUE SE TRATE DE
			// UN ARCHIVO HTML: ENTONCES SE DESCARGARÁ EL CUERPO
			// COMPLETO, A FIN DE PROCESARLO PARA ENCONTRAR EL LINK
			// DEL RECURSO QUE ESTÁ EMBEBIDO DENTRO DEL MISMO Y QUE 
			// ES EL QUE VERDADERAMENTE QUEREMOS DESCARGAR LUEGO.
			(function analizarRecurso(sourceIndex, descargarCuerpo = false) {
				
				
				// CONFIGURAMOS LAS OPCIONES DE LA DESCARGA Y LA INICIAMOS
				var requestOptions =  {
					url: sources[sourceIndex].fileLink,
					headers: {Cookie: cookieCorrectLogin[0].name + "=" + cookieCorrectLogin[0].value}, // PASAMOS LA COOKIE DE SESION DE USUARIO PARA PODER ACCEDER A LA DESCARGA
					rejectUnauthorized: false, // NO ESTOY SEGURO DE QUE HACE ESTO... PERO SIN ESTO LA DESCARGA ES RECHAZADA. NO TENGO GANAS DE HILAR FINO AHORA
					method: (descargarCuerpo) ? "GET" : "HEAD" // EL METODO "HEAD" SOLO DESCARGA LAS CABECERAS, CON "GET" SE OBTIENE EL CUERPO TAMBIEN.
				};

				// CONFIGURACIONES ADICIONALES PARA EL ANALISIS DE CARPETAS DEL MOODLE
				if (sources[sourceIndex].isMoodleFolder_id !== null) {
					requestOptions.strictSSL = false; // ES NECESARIO DESACTIVAR LAS DESCARGAS A TRAVES DE SSL SOLAMENTE PARA LAS CARPETAS DEL MOODLE, PARA LOS OTROS TIPOS RECURSOS ESTA LINEA PUEDE BORRARSE O USAR "TRUE".
					requestOptions.qs = {
						id: sources[sourceIndex].isMoodleFolder_id, // [NUM] ESTE PARAMETRO SOLO ES USADO CUANDO SE SOLICITA LA DESCARGA DE UNA CARPETA DEL MOODLE. SIN EL MISMO, LA DESCARGA NO PUEDE REALIZARSE. PARA LOS OTROS TIPOS DE RECURSOS NO ES NECESARIO USARLO.
						// "sesskey": "Z2mn5nZrB8" // ESTE PARÁMETRO TAMBIÉN ES ENVIADO CUANDO EL NAVEGADOR SOLICITA LA DESCARGA DE LA CARPETA, PERO NO ES NECESARIO SEGUN LAS PRUEBAS QUE ESTUVE HACIENDO. ADEMAS, OBTENER SU VALOR CORRECTO RESULTA COMPLICADO Y NO TIENE SENTIDO.
					};
				}

				request(requestOptions, function(error, res) {

					
					// SI SE PRODUCE UN ERROR, VOLVEMOS
					// A INTENTAR DESCARGAR EL RECURSO
					if (error) {
						console.error(`  ✖ [${sourceIndex + 1}/${sources.length}] ${sources[sourceIndex].fileTitle}  →  Error. Reitentando...`);
						analizarRecurso(sourceIndex);
					
						
					// CASO CONTRARIO, PROCESAMOS Y OBTENEMOS 
					// INFORMACIÓN DE INTERES DEL MISMO.
					} else {
						

						// OBTENEMOS EL NOMBRE DE ARCHIVO ORIGINAL
						// Y SU EXTENSIÓN. ESTA INFORMACIÓN VIENE
						// EN LA CABECERA DE LA RESPUESTA. NO TODAS
						// LAS RESPUESTAS LA INCLUYEN, PORQUE DEPENDE
						// DEL CONTENIDO DE LAS MISMAS, CLARO ESTÁ.
						if(res.headers['content-disposition']) {
							var fileNameData = ((res.headers['content-disposition'].match(/filename=\"([^"]*)\"/gi))[0]).split(".");
							if (fileNameData.length > 1) {
								fileExtension = (fileNameData.slice(-1)).toString().slice(0, -1);
								sources[sourceIndex].fileName = sources[sourceIndex].fileName + "." + fileExtension;
								sources[sourceIndex].originalFileName = fileNameData[0].split('"').slice(-1).toString() + "." + fileExtension;
							} 
						}


						// TAMBIEN OBTENEMOS EL TAMAÑO DEL ARCHIVO, LO CUAL
						// NOS SERVIRA LUEGO PARA CORROBORAR SI EL MISMO YA
						// FUE DESCARGADO Y SE ENCUENTRA EN DISCO O AUN NÓ.
						// CON ESTO SE PUEDE EVITAR RE-DESCARGAR COSAS.
						if(res.headers['content-length']) {
							sources[sourceIndex].fileSize = +res.headers['content-length'];
						}


						// DETECTAMOS EL TIPO DEL CONTENIDO DE LA RESPUESTA.
						// SI ES HTML, LO PROCESAREMOS LUEGO A FIN DE OBTENER 
						// EL RECURSO QUE ESTÁ EMBEBIDO (INCRUSTADO) EN ÉL.
						if (res.headers['content-type']) {
							sources[sourceIndex].contentType = res.headers['content-type'];
							if (descargarCuerpo === false) console.log(`\n    [${sourceIndex + 1}/${sources.length}] ${sources[sourceIndex].sectionName}:\n\t    Nombre: "${sources[sourceIndex].fileTitle}"\n\t    Tipo: ${res.headers['content-type']}`);
							

							// SI SE TRATA DE UN HTML CON UN RECURSO EMBEBIDO DENTRO, LO 
							// ANALIZAMOS A FIN DE ENCONTRAR LA VERDADERA DIRECCION DEL ARCHIVO
							if (res.headers['content-type'].indexOf("html") != -1) {
								if (res.body == "") {
									console.log(`\t    El link conduce a un archivo HTML: Obteniendo recurso real...`); // ⤷
									analizarRecurso(sourceIndex, true); // ANALIZAMOS EL CUERPO COMPLETO
								} else {
									var link = buscarRecursosEnHTML(res.body);
									sources[sourceIndex].fileLink = link;
									console.log(`\t    Recurso real: "...${(link).slice(-50)}"`); // ⟳↻
									console.log(`\t    Obteniendo información del archivo...`); // ⟳↻
									analizarRecurso(sourceIndex);
								}
								
							// CASO CONTRARIO, PASAMOS AL SIGUIENTE RECURSO
							} else {
								if ((sourceIndex + 1) < sources.length) {
									analizarRecurso(sourceIndex + 1);
								} else {
									term.brightGreen("\n  ✓ Archivos analizados.\n");
									console.log("    Peso total de los recursos: " + ((sources.reduce((i,j)=>({fileSize: i.fileSize + j.fileSize}))).fileSize/1e6).toFixed(2) + " MB.\n\n");
									resolve();
								}
							}
						}
					}
				});
			})(0);
		});
	}
	console.info("  ▪ Analizando tipos de archivos...");
	await analizarRecursos();
	
	

	// ESTA FUNCION DESCARGA TODOS LOS RECURSOS QUE SE
	// ENCUENTRAN LISTADOS EN LA VARIABLE "sources".
	// CONTIENE PARTES DEL TIPO ASYNCRÓNICO, ASÍ QUE
	// AL LLAMARLA, ES BUENO UTILIZAR "await" PARA
	// EVITAR QUE EL RESTO DEL CODIGO SE SIGA EJECUTANDO
	// ANTES DE QUE TODOS LOS RECURSOS SE HAYAN DESCARGADO
	function descargarRecursos() {


		// DEVOLVEMOS UNA PROMESA CUANDO LLAMEN A LA FUNCIÓN.
		// SERÁ RESUELTA UNA VEZ QUE SEAN DESCARGADOS TODOS
		// LOS RECURSOS. LA EJECUCIÓN DEL PROGRAMA QUE ESTÁ
		// LUEGO DE LA LLAMADA A LA FUNCIÓN SE DETENDRÁ HASTA
		// QUE LA PROMESA SEA RESUELTA. ESTO ES LO PROPIO DEL 
		// MODO DE TRABAJO ASINCRÓNICO EN JS. UTILIZAMOS AWAIT
		// EN LA LLAMADA PARA ESPERAR EL CUMPLIMIENTO DE LA PROMESA.
		return new Promise(function(resolve, reject) {


			// ESTA FUNCION ORDENA LA DESCARGA DEL SIGUIENTE
			// RECURSO DE LA LISTA, O DA POR FINALIZADO TODA
			// ESTA TAREA SI LA TOTALIDAD DE LOS RECURSOS SE
			// DESCARGARON.
			function downloadNextOrEnd (sourceIndexActual) {
				if ((sourceIndexActual + 1) < sources.length) {
					descargarRecurso(sourceIndexActual + 1);
				} else {
					term.brightGreen("\n  ✓ Descargados todos los archivos. Podés encontrarlos en la carpeta:\n\n");
					term.brightBlue.bold('    "./descargas/' + sources[0].courseName + ' - Aula Virtual"\n\n');
					resolve(); // AL FINALIZAR TODAS LAS DESCARGAS, SE RESUELVE LA PROMESA
				}
			}

				
			// ESTA FUNCION CORROBORA SI EL ARCHIVO QUE
			// SE VA A DESCARGAR SE ENCUENTRA O NO EN EL
			// DISCO. ESTO ES UTIL PARA EVITAR REDESCARGAR
			// COSAS QUE REALMENTE YA FUERON DESCARGADAS EN
			// OCASIONES ANTERIORES.
			function isInDisc (sourceIndex) {
				var file = path.join("descargas", sources[sourceIndex].courseName + " - Aula Virtual", sources[sourceIndex].sectionName, sources[sourceIndex].subSectionName, sources[sourceIndex].fileName);
				try {
					fs.accessSync(file, fs.constants.F_OK);
					var fileSizeInDisc = +fs.statSync(file).size;
					if (fileSizeInDisc === sources[sourceIndex].fileSize)
						return true;
					//else
					//	TODO: cambiar el nombre si no tienen el mismo tamaño...
				} catch (e) {
					return false;
				}
			}


			// ESTA FUNCION INICIA, MUESTRA EL PROGRESO
			// Y DA PASO A LA FINALIZACIÓN DE LA DESCARGA
			// DE UN RECURSO, SEGUN EL INDICE DEL MISMO
			function descargarRecurso(sourceIndex) {

				
				// SI EL ARCHIVO YA ESTA DESCARGADO, LO OMITIMOS
				if (isInDisc(sourceIndex) && !_config["forzar-redescarga-cursoCompleto"]) {
					term.bold(`    [${sourceIndex + 1}/${sources.length}] ${sources[sourceIndex].fileTitle}: `).brightGreen(`Ya descargado previamente.\n\n`);
					downloadNextOrEnd(sourceIndex);
				

				// CASO CONTRARIO, CONFIGURAMOS LAS PROPIEDADES DE LA BARRA DE
				// PROGRESO PARA LAS DESCARGASINICIAMOS LA DESCARGA DEL RECURSO
				} else {
					var progressBar = term.progressBar({
						eta: true,
						percent: true,
						title: `    [${sourceIndex + 1}/${sources.length}] ${sources[sourceIndex].fileTitle}`,
						barStyle: term.brightGreen
					});

					// CONFIGURAMOS LAS OPCIONES DE LA DESCARGA Y LA INICIAMOS
					var requestOptions =  {
						url: sources[sourceIndex].fileLink,
						headers: {Cookie: cookieCorrectLogin[0].name + "=" + cookieCorrectLogin[0].value}, // PASAMOS LA COOKIE DE SESION DE USUARIO PARA PODER ACCEDER A LA DESCARGA
						rejectUnauthorized: false, // NO ESTOY SEGURO DE QUE HACE ESTO... PERO SIN ESTO LA DESCARGA ES RECHAZADA. NO TENGO GANAS DE HILAR FINO AHORA
						method: "GET", // EL METODO "HEAD" SOLO DESCARGA LAS CABECERAS, CON "GET" SE OBTIENE EL CUERPO TAMBIEN.
					};

					// CONFIGURACIONES ADICIONALES PARA LA DESCARGA DE CARPETAS DEL MOODLE
					if (sources[sourceIndex].isMoodleFolder_id !== null) {
						requestOptions.strictSSL = false; // ES NECESARIO DESACTIVAR LAS DESCARGAS A TRAVES DE SSL SOLAMENTE PARA LAS CARPETAS DEL MOODLE, PARA LOS OTROS TIPOS RECURSOS ESTA LINEA PUEDE BORRARSE O USAR "TRUE".
						requestOptions.qs = {
							id: sources[sourceIndex].isMoodleFolder_id, // [NUM] ESTE PARAMETRO SOLO ES USADO CUANDO SE SOLICITA LA DESCARGA DE UNA CARPETA DEL MOODLE. SIN EL MISMO, LA DESCARGA NO PUEDE REALIZARSE. PARA LOS OTROS TIPOS DE RECURSOS NO ES NECESARIO USARLO.
							// "sesskey": "Z2mn5nZrB8" // ESTE PARÁMETRO TAMBIÉN ES ENVIADO CUANDO EL NAVEGADOR SOLICITA LA DESCARGA DE LA CARPETA, PERO NO ES NECESARIO SEGUN LAS PRUEBAS QUE ESTUVE HACIENDO. ADEMAS, OBTENER SU VALOR CORRECTO RESULTA COMPLICADO Y NO TIENE SENTIDO.
						};
					}

					// INICIAMOS LA DESCARGA
					progress(request(requestOptions, function(error, res) {
						if (error) {
							if (progressBar) progressBar.stop();
							// console.log("    Se produjo un error en la descarga de '" + sources[sourceIndex].fileTitle + ": " + error + "'.\n");
							term.bold.brightRed(`    [${sourceIndex + 1}/${sources.length}] ${sources[sourceIndex].fileTitle}: Error.\n\n`);
							downloadNextOrEnd(sourceIndex);
						} 
					}), {
						// throttle: 2000,                    // Throttle the progress event to 2000ms, defaults to 1000ms
						// delay: 1000,                       // Only start to emit after 1000ms delay, defaults to 0ms
						// lengthHeader: 'x-transfer-length'  // Length header to use, defaults to content-length
					})

					.on('progress', function (state) {
						// The state is an object that looks like this:
						// {
						//     percent: 0.5,               // Overall percent (between 0 to 1)
						//     speed: 554732,              // The download speed in bytes/sec
						//     size: {
						//         total: 90044871,        // The total payload size in bytes
						//         transferred: 27610959   // The transferred payload size in bytes
						//     },
						//     time: {
						//         elapsed: 36.235,        // The total elapsed seconds since the start (3 decimals)
						//         remaining: 81.403       // The remaining seconds to finish (3 decimals)
						//     }
						// }
				
						//console.log('progress', state);
						progressBar.update(state.percent);
					})

					.on('error', function (err) {
						// MANEJO DE ERRORES
						// console.log("Ha ocurrido un error con una de las descargas."); // TODO: Ver si esto va o nó....
						// progressBar.stop(); // TODO: Aparentemente esto causa errores... porque ya es detenida en otra deteccin de error.
					})

					.on('end', function () {
						// TERMINA LA DESCARGA DEL ARCHIVO ACTUAL: LLEVAMOS
						// LA BARRA DE PROGRESO AL 100% Y LA DETENEMOS.
						progressBar.update(1);
						progressBar.stop();
						console.log("\n");
		

						// INICIAMOS LA DESCARGA DEL SIGUIENTE ARCHIVO EN LA
						// COLA, O FINALIZAMOS SI YA TODOS FUERON DESCARGADOS
						downloadNextOrEnd(sourceIndex);
					})
					.pipe(fs.createWriteStream(path.join("descargas", sources[sourceIndex].courseName + " - Aula Virtual", sources[sourceIndex].sectionName, sources[sourceIndex].subSectionName, sources[sourceIndex].fileName))); 
				}
			}
			descargarRecurso(0);
		});
	}


	// INICIAMOS LA DESCARGA
	console.info("  ▪ Descargando archivos:\n");
	await descargarRecursos();


	// FINALIZACIÓN
	console.info("\n▪ OPERACIÓN FINALIZADA\n");
	await browser.close();
}



  
// FUNCION PRINCIPAL
(async () => {
	

	// MOSTRAMOS UN MENU AL USUARIO
	await launchMenu();

	



})();

// Gracias Señor Jesús.-