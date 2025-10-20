// auth.js - Sistema de Autenticación TUPAK RANTINA
// Gestión de sesiones y verificación de acceso

// ===== CONFIGURACIÓN SUPABASE =====
const SUPABASE_URL = 'https://lpsupabase.luispinta.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.bZRDLg2HoJKCXPp_B6BD5s-qcZM6-NrKO8qtxBtFGTk';

// Configuración de sesión
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hora en milisegundos
const SESSION_KEY = 'tupak_session';
const LAST_ACTIVITY_KEY = 'tupak_last_activity';
const SUPABASE_SESSION_KEY = 'tupak_supabase_session';

// Configuración OTP
const OTP_SESSION_KEY = 'tupak_otp_session';
const OTP_TIMEOUT = 5 * 60 * 1000; // 5 minutos para ingresar OTP
const WHATSAPP_API_URL = 'https://api.luispinta.com/message/sendText/CajaGerencia';
const WHATSAPP_API_KEY = 'smaksnaHG';

// Crear instancia de Supabase
let supabase;
if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { 
            persistSession: true, // CAMBIO: Activar persistencia de sesión
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            storeSupabaseSession(session);
        } else {
            sessionStorage.removeItem(SUPABASE_SESSION_KEY);
            supabaseSessionRestored = false;
        }
    });
} else {
    console.error('Supabase no está cargado. Asegúrate de incluir el SDK de Supabase.');
}

// ===== VARIABLES GLOBALES =====
let currentUser = null;
let sessionCheckInterval = null;
let supabaseSessionRestored = false;

// ===== GESTIÓN DE SESIÓN =====
function setSession(user) {
    const sessionData = {
        user: user,
        loginTime: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    currentUser = user;
}

function getSession() {
    const sessionData = sessionStorage.getItem(SESSION_KEY);
    if (!sessionData) return null;
    
    try {
        return JSON.parse(sessionData);
    } catch (error) {
        console.error('Error al parsear sesión:', error);
        clearSession();
        return null;
    }
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    sessionStorage.removeItem(SUPABASE_SESSION_KEY);
    currentUser = null;
    supabaseSessionRestored = false;
}

function updateLastActivity() {
    if (getSession()) {
        sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    }
}

function storeSupabaseSession(session) {
    if (!session) return;

    const tokens = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at || null
    };

    sessionStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(tokens));
    supabaseSessionRestored = true;
}

async function ensureSupabaseSession() {
    if (!supabase) {
        console.error('❌ Supabase no está inicializado');
        return false;
    }

    try {
        // Primero verificar si ya hay una sesión activa
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('❌ Error al obtener sesión de Supabase:', error);
            return false;
        }

        if (data?.session) {
            supabaseSessionRestored = true;
            storeSupabaseSession(data.session);
            return true;
        }

        // Si no hay sesión activa, intentar restaurar desde sessionStorage
        const storedSession = sessionStorage.getItem(SUPABASE_SESSION_KEY);
        
        if (!storedSession) {
            console.error('❌ No hay tokens almacenados para restaurar');
            return false;
        }

        const tokens = JSON.parse(storedSession);
        if (!tokens?.access_token || !tokens?.refresh_token) {
            console.error('❌ Tokens inválidos');
            return false;
        }

        // Restaurar la sesión con los tokens
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token
        });

        if (sessionError) {
            console.error('❌ Error restaurando sesión:', sessionError);
            return false;
        }

        if (sessionData?.session) {
            storeSupabaseSession(sessionData.session);
            supabaseSessionRestored = true;
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error en ensureSupabaseSession:', error);
        return false;
    }
}

function checkSessionTimeout() {
    const session = getSession();
    if (!session) return false;
    
    const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivity) return false;
    
    const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
    
    if (timeSinceLastActivity > SESSION_TIMEOUT) {
        showNotification('Sesión expirada por inactividad', 'warning');
        logout();
        return false;
    }
    
    return true;
}

// ===== VERIFICACIÓN DE PERMISOS EN DOCSUSERSTR =====
async function checkUserPermissions(email) {
    try {
        const { data, error } = await supabase
            .from('docsuserstr')
            .select('*')
            .eq('correo', email)
            .eq('activo', true)
            .single();

        if (error) {
            console.error('Error en checkUserPermissions:', error);
            return { hasPermission: false, userData: null };
        }

        if (!data) {
            return { hasPermission: false, userData: null };
        }

        return { hasPermission: true, userData: data };
    } catch (error) {
        console.error('Error verificando permisos:', error);
        return { hasPermission: false, userData: null };
    }
}

// ===== REGISTRAR LOGIN EN user_logins =====
async function logUserLogin(userId, email, documentoAbierto = 'Sin especificar') {
    try {
        // Asegurar que la sesión de Supabase esté activa
        await ensureSupabaseSession();
        
        // Verificar que tenemos una sesión activa
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
            console.error('❌ No hay sesión activa de Supabase');
            return false;
        }

        const { data, error } = await supabase
            .from('user_logins')
            .insert([
                {
                    user_id: userId,
                    correo: email,
                    documento_abierto: documentoAbierto
                }
            ])
            .select();

        if (error) {
            console.error('❌ Error registrando login:', error);
            console.error('   Código de error:', error.code);
            console.error('   Mensaje:', error.message);
            console.error('   Detalles:', error.details);
            console.error('   Hint:', error.hint);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error en logUserLogin:', error);
        console.error('   Stack:', error.stack);
        return false;
    }
}

// ===== FUNCIONES OTP =====
function generateOTP() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return otp;
}

function storeOTPSession(email, otp, userData, supabaseData) {
    const otpSession = {
        email: email,
        otp: otp,
        userData: userData,
        supabaseData: supabaseData,
        timestamp: Date.now()
    };
    sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify(otpSession));
}

function getOTPSession() {
    const otpData = sessionStorage.getItem(OTP_SESSION_KEY);
    if (!otpData) return null;
    
    try {
        const session = JSON.parse(otpData);
        const elapsed = Date.now() - session.timestamp;
        
        if (elapsed > OTP_TIMEOUT) {
            clearOTPSession();
            return null;
        }
        
        return session;
    } catch (error) {
        console.error('Error al parsear sesión OTP:', error);
        clearOTPSession();
        return null;
    }
}

function clearOTPSession() {
    sessionStorage.removeItem(OTP_SESSION_KEY);
}

async function sendOTPWhatsApp(phoneNumber, otp, userName) {
    try {
        const message = `🔐 *TUPAK RANTINA - Código de Verificación*\n\nHola ${userName},\n\nTu código de acceso es: *${otp}*\n\nEste código expira en 5 minutos.\n\n_Si no solicitaste este código, ignora este mensaje._`;
        
        const options = {
            method: 'POST',
            headers: {
                'apikey': WHATSAPP_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                number: phoneNumber,
                text: message,
                delay: 0,
                linkPreview: false
            })
        };

        const response = await fetch(WHATSAPP_API_URL, options);
        const data = await response.json();
        
        if (response.ok) {
            return { success: true, data: data };
        } else {
            console.error('Error al enviar OTP:', data);
            return { success: false, error: 'Error al enviar código' };
        }
    } catch (error) {
        console.error('Error en sendOTPWhatsApp:', error);
        return { success: false, error: error.message };
    }
}

// ===== REGISTRAR ACCIÓN DEL USUARIO =====
async function logUserAction(accion) {
    const userId = getUserId();
    const userEmail = getUserEmail();
    
    if (!userId || !userEmail) {
        return false;
    }
    
    try {
        // Asegurar que la sesión de Supabase esté activa
        const sessionOk = await ensureSupabaseSession();
        if (!sessionOk) {
            console.error('❌ No se pudo asegurar la sesión de Supabase');
            // Intentar de todas formas (por si la sesión está en las cookies)
        }
        
        // Verificar una vez más que tenemos una sesión activa
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.error('❌ Error verificando sesión:', sessionError);
            return false;
        }
        
        if (!sessionData?.session) {
            console.error('❌ No hay sesión activa de Supabase');
            return false;
        }

        const { data, error } = await supabase
            .from('user_logins')
            .insert([
                {
                    user_id: userId,
                    correo: userEmail,
                    documento_abierto: accion
                }
            ])
            .select();

        if (error) {
            console.error('❌ Error registrando acción:', error);
            console.error('   Código de error:', error.code);
            console.error('   Mensaje:', error.message);
            console.error('   Detalles:', error.details);
            console.error('   Hint:', error.hint);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error en logUserAction:', error);
        console.error('   Stack:', error.stack);
        return false;
    }
}

// ===== INICIO DE SESIÓN =====
async function login(email, password) {
    try {
        // 1. Autenticar con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        if (!data.user) {
            return { success: false, error: 'No se pudo iniciar sesión' };
        }

        // 2. Verificar permisos en docsuserstr
        const { hasPermission, userData } = await checkUserPermissions(email);
        
        if (!hasPermission) {
            // Cerrar sesión de Supabase si no tiene permisos
            await supabase.auth.signOut();
            return { 
                success: false, 
                error: 'No cuentas con los permisos suficientes para acceder a este sistema.' 
            };
        }

        // 3. Verificar que el usuario tenga WhatsApp configurado
        if (!userData.whatsapp) {
            await supabase.auth.signOut();
            return {
                success: false,
                error: 'No tienes un número de WhatsApp configurado. Contacta al administrador.'
            };
        }

        // 4. Generar OTP
        const otp = generateOTP();
        
        // 5. Enviar OTP por WhatsApp
        const sendResult = await sendOTPWhatsApp(userData.whatsapp, otp, userData.nombre);
        
        if (!sendResult.success) {
            await supabase.auth.signOut();
            return {
                success: false,
                error: 'No se pudo enviar el código de verificación. Intenta nuevamente.'
            };
        }

        // 6. Guardar toda la información de sesión (NO cerrar sesión de Supabase)
        storeOTPSession(email, otp, userData, data);
        
        // 7. Guardar sesión de Supabase para mantenerla activa
        if (data.session) {
            storeSupabaseSession(data.session);
        }
        
        return { 
            success: true, 
            requiresOTP: true,
            message: `Código enviado a WhatsApp terminado en (${userData.whatsapp.slice(-4)})`
        };
    } catch (error) {
        console.error('Error en login:', error);
        return { success: false, error: error.message };
    }
}

// ===== VERIFICAR OTP Y COMPLETAR LOGIN =====
async function verifyOTPAndLogin(inputOTP) {
    try {
        // 1. Obtener sesión OTP
        const otpSession = getOTPSession();
        
        if (!otpSession) {
            return {
                success: false,
                error: 'El código ha expirado. Por favor, inicia sesión nuevamente.'
            };
        }

        // 2. Verificar OTP
        if (inputOTP.toUpperCase() !== otpSession.otp) {
            return {
                success: false,
                error: 'Código incorrecto. Verifica e intenta nuevamente.'
            };
        }

        // 3. La sesión de Supabase ya está activa, solo verificamos que siga válida
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
            console.error('Error al verificar sesión:', error);
            clearOTPSession();
            return {
                success: false,
                error: 'Sesión expirada. Por favor, inicia sesión nuevamente.'
            };
        }

        // 4. Guardar sesión con datos adicionales
        const enhancedUser = {
            ...session.user,
            userData: otpSession.userData
        };
        setSession(enhancedUser);
        
        // 5. Limpiar sesión OTP
        clearOTPSession();
        
        // 6. Iniciar monitoreo
        startSessionMonitoring();
        
        return { success: true, user: enhancedUser };
    } catch (error) {
        console.error('Error en verifyOTPAndLogin:', error);
        clearOTPSession();
        return { success: false, error: error.message };
    }
}

// ===== CIERRE DE SESIÓN =====
async function logout() {
    try {
        // Cerrar sesión en Supabase
        await supabase.auth.signOut();
        
        // Limpiar sesión local
        clearSession();
        
        // Detener monitoreo
        stopSessionMonitoring();
        
        // Redirigir al login
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        // Forzar limpieza y redirección
        clearSession();
        stopSessionMonitoring();
        window.location.href = 'login.html';
    }
}

// ===== VERIFICACIÓN DE AUTENTICACIÓN =====
async function checkAuth() {
    const session = getSession();
    
    if (!session) {
        redirectToLogin();
        return false;
    }
    
    // Verificar timeout
    if (!checkSessionTimeout()) {
        return false;
    }
    
    // Verificar que tenga datos de usuario de docsuserstr
    // (Ya se verificaron en el login, no volver a consultar Supabase)
    if (!session.user.userData) {
        console.error('Sesión sin datos de usuario');
        redirectToLogin();
        return false;
    }
    
    // Verificar que el usuario siga activo (usando datos en sesión)
    if (!session.user.userData.activo) {
        showNotification('Tus permisos de acceso han sido revocados', 'error');
        await logout();
        return false;
    }
    
    // La sesión es válida si existe y no ha expirado
    currentUser = session.user;
    updateLastActivity();
    startSessionMonitoring();
    return true;
}

function redirectToLogin() {
    // Verificar que no estemos ya en la página de login
    if (!window.location.pathname.includes('login.html')) {
        clearSession();
        window.location.href = 'login.html';
    }
}

// ===== MONITOREO DE SESIÓN =====
function startSessionMonitoring() {
    // Limpiar intervalo anterior si existe
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }
    
    // Verificar sesión cada 30 segundos
    sessionCheckInterval = setInterval(() => {
        if (!checkSessionTimeout()) {
            stopSessionMonitoring();
        }
    }, 30000);
    
    // Actualizar actividad con eventos del usuario
    document.addEventListener('mousemove', updateLastActivity);
    document.addEventListener('keypress', updateLastActivity);
    document.addEventListener('click', updateLastActivity);
    document.addEventListener('scroll', updateLastActivity);
}

function stopSessionMonitoring() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
    
    // Remover event listeners
    document.removeEventListener('mousemove', updateLastActivity);
    document.removeEventListener('keypress', updateLastActivity);
    document.removeEventListener('click', updateLastActivity);
    document.removeEventListener('scroll', updateLastActivity);
}

// ===== NOTIFICACIONES =====
function showNotification(message, type = 'info') {
    // Crear contenedor si no existe
    let container = document.getElementById('auth-notifications');
    if (!container) {
        container = document.createElement('div');
        container.id = 'auth-notifications';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
        `;
        document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    notification.style.cssText = `
        background: ${colors[type] || colors.info};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        margin-bottom: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 300px;
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== OBTENER INFORMACIÓN DEL USUARIO =====
function getCurrentUser() {
    return currentUser || (getSession()?.user || null);
}

function getUserId() {
    const user = getCurrentUser();
    if (!user) return null;
    
    return user.id || null;
}

function getUserDisplayName() {
    const user = getCurrentUser();
    if (!user) return 'Usuario';
    
    // Priorizar nombre de docsuserstr
    if (user.userData?.nombre) {
        return user.userData.nombre;
    }
    
    return user.user_metadata?.full_name || 
           user.email?.split('@')[0] || 
           'Usuario';
}

function getUserEmail() {
    const user = getCurrentUser();
    if (!user) return '';
    
    return user.userData?.correo || user.email || '';
}

// ===== CERRAR SESIÓN AL CERRAR VENTANA/PESTAÑA =====
window.addEventListener('beforeunload', () => {
    // La sesión se limpiará automáticamente porque está en sessionStorage
    // No necesitamos hacer nada extra aquí
});

// ===== ESTILOS DE ANIMACIÓN =====
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ===== EXPORTAR API PÚBLICA =====
window.TupakAuth = {
    login,
    logout,
    checkAuth,
    getCurrentUser,
    getUserId,
    getUserDisplayName,
    getUserEmail,
    checkUserPermissions,
    logUserLogin,
    logUserAction,
    showNotification,
    updateLastActivity,
    // Funciones OTP
    verifyOTPAndLogin,
    getOTPSession,
    clearOTPSession
};
