// Navbar reutilizable para todas las vistas
function createNavbar(activePage = 'dashboard') {
    const navbar = `
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
            <div class="container-fluid">
                <a class="navbar-brand" href="/dashboard.html">AcreditadorBot</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav ms-auto">
                        <li class="nav-item"><a class="nav-link ${activePage === 'dashboard' ? 'active' : ''}" href="/dashboard.html">Dashboard</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'tickets' ? 'active' : ''}" href="/tickets.html">Tickets Clientes</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'clientes' ? 'active' : ''}" href="/clientes.html">Clientes</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'asignacion' ? 'active' : ''}" href="/asignacion.html">Asignación</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'upload' ? 'active' : ''}" href="/upload.html">Subir CSV</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'logs' ? 'active' : ''}" href="/logs.html">Logs</a></li>
                        <li class="nav-item"><a class="nav-link ${activePage === 'portal-users' ? 'active' : ''}" href="/portal-users.html">Portal Usuarios</a></li>
                    </ul>
                </div>
            </div>
        </nav>
    `;
    
    // Insertar el navbar al inicio del body
    document.body.insertAdjacentHTML('afterbegin', navbar);
}

// Función para inicializar el navbar en cualquier página
function initNavbar(activePage = 'dashboard') {
    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => createNavbar(activePage));
    } else {
        createNavbar(activePage);
    }
} 