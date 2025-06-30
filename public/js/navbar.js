// Navbar reutilizable para todas las vistas
function createNavbar(activePage = 'dashboard') {
    const navbar = `
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
            <div class="container">
                <a class="navbar-brand fw-bold" href="/"><i class="fas fa-robot me-2"></i>AcreditadorBot</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav ms-auto">
                        <li class="nav-item"><a class="nav-link ${activePage === 'dashboard' ? 'active' : ''}" href="/dashboard.html">Dashboard</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'acreditaciones' ? 'active' : ''}" href="/acreditaciones.html">Comprobantes</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'clientes' ? 'active' : ''}" href="/clientes.html">Clientes</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'asignacion' ? 'active' : ''}" href="/asignacion.html">Asignación</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'tickets' ? 'active' : ''}" href="/tickets.html">Tickets</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'upload' ? 'active' : ''}" href="/upload.html">Subir CSV</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'logs' ? 'active' : ''}" href="/logs.html">Logs</a></li>
                    </ul>
                </div>
            </div>
        </nav>
    `;
    
    return navbar;
}

// Función para reemplazar el navbar existente
function replaceNavbar(activePage = 'dashboard') {
    const existingNavbar = document.querySelector('nav.navbar');
    if (existingNavbar) {
        existingNavbar.outerHTML = createNavbar(activePage);
    }
}

// Función para detectar automáticamente la página activa
function detectActivePage() {
    const path = window.location.pathname;
    
    if (path.includes('dashboard')) return 'dashboard';
    if (path.includes('acreditaciones')) return 'acreditaciones';
    if (path.includes('clientes')) return 'clientes';
    if (path.includes('asignacion')) return 'asignacion';
    if (path.includes('tickets')) return 'tickets';
    if (path.includes('upload')) return 'upload';
    if (path.includes('logs')) return 'logs';
    if (path.includes('cliente')) return 'clientes';
    if (path === '/' || path === '/index.html') return 'dashboard';
    
    return 'dashboard';
}

// Función para inicializar el navbar en cualquier página
function initNavbar(activePage = null) {
    // Si no se especifica página activa, detectarla automáticamente
    if (!activePage) {
        activePage = detectActivePage();
    }
    
    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => replaceNavbar(activePage));
    } else {
        replaceNavbar(activePage);
    }
}

// Inicializar automáticamente cuando se carga el script
initNavbar(); 