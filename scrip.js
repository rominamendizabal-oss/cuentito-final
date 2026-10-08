// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnReadAloud = document.getElementById('btn-read-aloud');

// Variables de estado
let pageFlip = null;
let currentScale = 1.4; // Escala base para buena visibilidad inicial
let pdfDoc = null;
let pagesTextContent = []; // Guardará el texto de cada página para la lectura de voz
const flipAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'); // Sonido de hoja al pasar

// 1. Cargar automáticamente "cuento.pdf" alojado en el mismo repositorio
document.addEventListener('DOMContentLoaded', () => {
    loadPDFFromRepo('cuento.pdf');
});

// Carga el archivo PDF local del repositorio
async function loadPDFFromRepo(pdfPath) {
    try {
        loading.style.display = 'block';
        const response = await fetch(pdfPath);
        if (!response.ok) {
            throw new Error(`No se encontró el archivo ${pdfPath} en la raíz del repositorio.`);
        }
        const arrayBuffer = await response.arrayBuffer();
        await renderBook(new Uint8Array(arrayBuffer));
    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = '❌ No se pudo cargar el cuento. Asegúrate de que el archivo "cuento.pdf" exista en tu repositorio de GitHub.';
    }
}

// Renderiza el PDF dentro de la librería PageFlip
async function renderBook(pdfData) {
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pagesTextContent = []; // Reiniciar buffer de texto

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const totalPages = pdfDoc.numPages;

        const firstPage = await pdfDoc.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: currentScale });
        const pageWidth = baseViewport.width;
        const pageHeight = baseViewport.height;

        // Renderizar cada página en un Canvas y guardar su texto
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: currentScale });

            // Extraer texto para la lectura en voz alta
            const textContent = await page.getTextContent();
            const pageString = textContent.items.map(item => item.str).join(' ');
            pagesTextContent.push(pageString);

            // Crear lienzo gráfico
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        bookContainer.style.display = 'block';

        // Inicializar efecto FlipBook
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Reproducir sonido al cambiar de página
        pageFlip.on('flip', () => {
            playPageSound();
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel(); // Detiene la voz anterior si cambia de página
                updateSpeechButton(false);
            }
        });

        loading.style.display = 'none';

    } catch (error) {
        console.error('Error procesando las páginas del PDF:', error);
        loading.innerText = 'Error al procesar el archivo PDF.';
    }
}

// Reproduce el efecto de sonido de la hoja
function playPageSound() {
    flipAudio.currentTime = 0;
    flipAudio.play().catch(() => {
        // Ignora restricciones de reproducción automática del navegador
    });
}

// 4. Botones de Navegación Página Anterior / Siguiente
btnPrev.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipPrev();
    }
});

btnNext.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipNext();
    }
});

// 3. Modificar el tamaño/zoom de la letra y lienzo
btnZoomIn.addEventListener('click', () => {
    if (currentScale < 2.2) {
        currentScale += 0.2;
        reRenderCurrentBook();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentScale > 0.8) {
        currentScale -= 0.2;
        reRenderCurrentBook();
    }
});

async function reRenderCurrentBook() {
    if (pdfDoc) {
        const data = await pdfDoc.getData();
        renderBook(data);
    }
}

// 3. Lectura en voz alta del cuento (Síntesis de voz en español)
btnReadAloud.addEventListener('click', () => {
    if ('speechSynthesis' in window) {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            updateSpeechButton(false);
            return;
        }

        const currentPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
        const textToRead = pagesTextContent[currentPageIndex];

        if (!textToRead || textToRead.trim() === '') {
            alert('No se detectó texto legible en esta página para leer.');
            return;
        }

        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'es-ES'; // Idioma español
        utterance.rate = 0.9;     // Velocidad ligeramente baja para mayor claridad infantil

        // Buscar voces disponibles en español en el navegador
        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
        if (spanishVoice) {
            utterance.voice = spanishVoice;
        }

        utterance.onstart = () => updateSpeechButton(true);
        utterance.onend = () => updateSpeechButton(false);
        utterance.onerror = () => updateSpeechButton(false);

        window.speechSynthesis.speak(utterance);
    } else {
        alert('Tu navegador no soporta la función de lectura en voz alta.');
    }
});

function updateSpeechButton(isSpeaking) {
    if (isSpeaking) {
        btnReadAloud.classList.add('speaking');
        btnReadAloud.innerHTML = '⏹️ Detener Lectura';
    } else {
        btnReadAloud.classList.remove('speaking');
        btnReadAloud.innerHTML = '🔊 Leer en Voz Alta';
    }
}