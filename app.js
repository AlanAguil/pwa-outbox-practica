// Ejemplo de guardado y lectura encadenada con .then() y .catch()

const capacidadesPWA = {
    serviceWorker: 'serviceWorker' in navigator,
    cacheAPI: 'caches' in window,
    indexDB: 'indexedDB' in window,
    pushNotification: 'pushManager' in window,
    webBluetooth: 'bluetooth' in navigator,
    storage: navigator.storage && 'storage' in navigator.storage,
}

if (capacidadesPWA.serviceWorker) {
    navigator.serviceWorker.register("./sw.js");
    console.log("El servicio service Woker está disponible");
} else {
    console.log("El servicio service Woker no está disponible")
}

function procesarEnvioReporte(datosFormulario) {
    const endpoint = 'https://jsonplaceholder.typicode.com/posts';

    return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosFormulario)
    })
        .then((respuesta) => {
            if (!respuesta.ok) throw new Error('Error HTTP del servidor');
            return respuesta.json();
        })
        .then(() => {
            // Envío exitoso en vivo: registrar en bitácora local como sincronizado
            return guardarRegistro({
                ...datosFormulario,
                estado: 'sincronizado',
                fechaCreacion: Date.now()
            });
        })
        .catch(() => {
            console.warn('[Outbox] Sin conexión. Encolando transacción localmente...');
            // Falla de red: guardar en IndexedDB como pendiente para reenvío posterior
            return guardarRegistro({
                ...datosFormulario,
                estado: 'pendiente',
                fechaCreacion: Date.now()
            });
        })
        .then(() => {
            // Actualizar la lista visual en ambos escenarios
            return renderizarColaOutbox();
        });
}

function sincronizarPendientes() {
    console.log('[Outbox] Conexión detectada. Buscando registros pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const pendientes = registros.filter((item) => item.estado === 'pendiente');

            if (pendientes.length === 0) {
                console.log('[Outbox] No hay transacciones pendientes por sincronizar.');
                return;
            }

            // Convertir cada registro pendiente en una promesa de envío + actualización
            const promesasDeEnvio = pendientes.map((item) => {
                return fetch('https://jsonplaceholder.typicode.com/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: item.titulo, body: item.descripcion })
                })
                    .then((res) => {
                        if (!res.ok) throw new Error('Falla al reintentar envío');
                        // Actualizar estado en IndexedDB de 'pendiente' a 'sincronizado'
                        return actualizarEstadoRegistro(item.id, 'sincronizado');
                    });
            });

            // Esperar a que todos los reenvíos concluyan
            return Promise.all(promesasDeEnvio);
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error durante la sincronización masiva:', error);
        });
}

function renderizarColaOutbox() {
    console.log('[Outbox] Renderizando registros ...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const listaOutbox = document.getElementById('lista-outbox');
            listaOutbox.innerHTML = '';

            registros.forEach((item) => {
                const li = document.createElement('li');
                const hora = new Date(item.fechaCreacion).toLocaleTimeString();
                li.textContent = `${item.titulo} - ${item.estado} - ${hora}`;
                listaOutbox.appendChild(li);
            });

        })
        .catch((error) => {
            console.error('[Outbox] Error al renderizar los registros:', error);
        });
}

const formIncidencia = document.getElementById('form-incidencia');
const btnPurgar = document.getElementById('btn-purgar');

formIncidencia.addEventListener('submit', (e) => {
    e.preventDefault();
    const titulo = document.getElementById('titulo').value;
    const descripcion = document.getElementById('descripcion').value;

    procesarEnvioReporte({ titulo, descripcion });

    formIncidencia.reset();
});

btnPurgar.addEventListener('click', () => {
    obtenerTodosLosRegistros()
        .then((registros) => {
            const sincronizados = registros.filter((item) => item.estado === 'sincronizado');

            if (sincronizados.length === 0) {
                console.log('[Outbox] No hay transacciones sincronizadas por eliminar.');
                return;
            }

            const promesasDeEnvio = sincronizados.map((item) => {
                return eliminarRegistro(item.id)
            });

            return Promise.all(promesasDeEnvio);
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error al purgar los registros:', error);
        })
});

function actualizarIndicadorRed() {
    const badge = document.getElementById('badge-red');
    if (navigator.onLine) {
        badge.textContent = 'En Línea';
        badge.className = 'badge online';
    } else {
        badge.textContent = 'Sin Conexión';
        badge.className = 'badge offline';
    }
}

// Escuchar el regreso de la conectividad
window.addEventListener('online', () => {
    actualizarIndicadorRed();
    sincronizarPendientes();
});

window.addEventListener('offline', actualizarIndicadorRed);

actualizarIndicadorRed();
renderizarColaOutbox();