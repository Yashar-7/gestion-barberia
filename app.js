require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

// RUTA PRINCIPAL (Para los alumnos)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// RUTA DE ADMINISTRACIÓN (Para ti)
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// API PARA OBTENER LOS PRESENTES
app.get('/api/presentes', async (req, res) => {
    try {
        const response = await fetch(`${URL}/rest/v1/attendance?select=*,users(full_name)&status=eq.presente`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) { res.status(500).json([]); }
});

// NUEVA API PARA REGISTRAR NUEVOS USUARIOS (Alumnos o Barberos)
app.post('/api/usuarios', async (req, res) => {
    const { full_name, dni } = req.body;
    try {
        const response = await fetch(`${URL}/rest/v1/users`, {
            method: 'POST',
            headers: { 
                "apikey": KEY, 
                "Authorization": `Bearer ${KEY}`, 
                "Content-Type": "application/json",
                "Prefer": "return=minimal" 
            },
            body: JSON.stringify({ full_name, dni })
        });

        if (response.ok) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "El DNI ya existe o hay un error de datos." });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: "Error de servidor al conectar con la base de datos." });
    }
});

// LÓGICA DE ASISTENCIA (DNI)
app.post('/asistencia', async (req, res) => {
    const { dni } = req.body;
    try {
        const resUser = await fetch(`${URL}/rest/v1/users?dni=eq.${dni}&select=id,full_name`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const users = await resUser.json();
        if (!users.length) return res.json({ success: false, message: "❌ DNI no registrado." });

        const user = users[0];
        const hoy = new Date().toISOString().split('T')[0];
        const resHoy = await fetch(`${URL}/rest/v1/attendance?user_id=eq.${user.id}&check_in=gte.${hoy}&check_out=is.null&select=*`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const reg = await resHoy.json();

        if (reg.length > 0) {
            await fetch(`${URL}/rest/v1/attendance?id=eq.${reg[0].id}`, {
                method: 'PATCH',
                headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ check_out: new Date().toISOString(), status: 'completado' })
            });
            res.json({ success: true, message: `👋 ¡Adiós, ${user.full_name}!` });
        } else {
            await fetch(`${URL}/rest/v1/attendance`, {
                method: 'POST',
                headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.id, status: 'presente' })
            });
            res.json({ success: true, message: `✅ ¡Hola, ${user.full_name}!` });
        }
    } catch (e) { res.json({ success: false, message: "❌ Error de conexión." }); }
});

// Configuración de puerto dinámica para Render o Localhost
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🚀 SERVIDOR FUNCIONANDO EN EL PUERTO: ${PORT}`));
