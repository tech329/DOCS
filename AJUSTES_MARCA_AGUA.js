// ====================================================================
// AJUSTES DE MARCA DE AGUA - Ejecutar en la consola del navegador
// ====================================================================
// Copia y pega este código en la consola (F12) para ajustar
// la marca de agua en tiempo real
// ====================================================================

// ====================================================================
// FUNCIONES DE AJUSTE
// ====================================================================

/**
 * Cambiar la velocidad de movimiento
 * @param {number} seconds - Segundos para completar un ciclo (15-60 recomendado)
 */
window.setWatermarkSpeed = function(seconds) {
    console.log(`⚡ Cambiando velocidad a ${seconds} segundos por ciclo...`);
    console.log('   ⚠️  Para aplicar, recarga la página y vuelve a llamar esta función');
    // Nota: La velocidad está en la función initDynamicWatermark
};

/**
 * Cambiar la opacidad de las marcas de agua
 * @param {number} opacity - Opacidad (0.01 - 0.20 recomendado)
 */
window.setWatermarkOpacity = function(opacity) {
    console.log(`🎨 Cambiando opacidad a ${opacity}...`);
    const items = document.querySelectorAll('.watermark-item');
    items.forEach(item => {
        item.style.color = `rgba(0, 23, 73, ${opacity})`;
    });
    console.log(`✅ Opacidad actualizada en ${items.length} marcas`);
};

/**
 * Cambiar el tamaño de fuente
 * @param {string} size - Tamaño de fuente (ej: '1em', '0.8em', '1.5em')
 */
window.setWatermarkSize = function(size) {
    console.log(`📏 Cambiando tamaño a ${size}...`);
    const items = document.querySelectorAll('.watermark-item');
    items.forEach(item => {
        item.style.fontSize = size;
    });
    console.log(`✅ Tamaño actualizado en ${items.length} marcas`);
};

/**
 * Mostrar/Ocultar marcas de agua
 * @param {boolean} show - true para mostrar, false para ocultar
 */
window.toggleWatermark = function(show) {
    const container = document.getElementById('watermarkContainer');
    if (container) {
        container.style.display = show ? 'block' : 'none';
        console.log(show ? '✅ Marcas de agua mostradas' : '❌ Marcas de agua ocultas');
    }
};

/**
 * Pausar/Reanudar movimiento
 */
window.pauseWatermarkMovement = function() {
    console.log('⏸️  Pausar movimiento no implementado directamente');
    console.log('   Solución: Recargar la página con velocidad muy alta (999)');
};

/**
 * Mostrar información de configuración actual
 */
window.showWatermarkInfo = function() {
    const items = document.querySelectorAll('.watermark-item');
    console.log('\n📊 CONFIGURACIÓN ACTUAL:');
    console.log('   Número de marcas:', items.length);
    if (items.length > 0) {
        const style = window.getComputedStyle(items[0]);
        console.log('   Tamaño de fuente:', style.fontSize);
        console.log('   Color:', style.color);
    }
    console.log('   Contenedor visible:', document.getElementById('watermarkContainer')?.style.display !== 'none');
};

// ====================================================================
// EJEMPLOS DE USO
// ====================================================================

// COMANDOS DISPONIBLES:
// setWatermarkOpacity(0.1)    - Cambiar opacidad (0.05-0.20)
// setWatermarkSize("1.5em")   - Cambiar tamaño de fuente
// toggleWatermark(false)      - Ocultar marcas de agua
// toggleWatermark(true)       - Mostrar marcas de agua
// showWatermarkInfo()         - Ver configuración actual
