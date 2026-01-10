require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

// RUTA PRINCIPAL
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// RUTA DE ADMINISTRACIÓN
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// API PARA OBTENER LOS PRESENTES (Solo los que tienen status 'presente')
app.get('/api/presentes', async (req, res) => {
    try {
        const response = await fetch(`${URL}/rest/v1/attendance?select=*,users(full_name,cuota_pagada,role)&status=eq.presente`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) { res.status(500).json([]); }
});

// API PARA MARCAR PAGO
app.post('/api/usuarios/pagar', async (req, res) => {
    const { id } = req.body;
    try {
        await fetch(`${URL}/rest/v1/users?id=eq.${id}`, {
            method: 'PATCH',
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ cuota_pagada: true })
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// API PARA ELIMINAR USUARIOS
app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await fetch(`${URL}/rest/v1/users?id=eq.${id}`, {
            method: 'DELETE',
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// API PARA REGISTRAR USUARIOS
app.post('/api/usuarios', async (req, res) => {
    const { full_name, dni, role } = req.body;
    try {
        const response = await fetch(`${URL}/rest/v1/users`, {
            method: 'POST',
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
            body: JSON.stringify({ full_name, dni, role: role || 'estudiante' })
        });
        if (response.ok) res.json({ success: true });
        else res.json({ success: false, message: "DNI duplicado o error." });
    } catch (e) { res.status(500).json({ success: false }); }
});

// LÓGICA DE ASISTENCIA (SINCRONIZADA)
app.post('/asistencia', async (req, res) => {
    const { dni } = req.body;
    try {
        // 1. Buscamos usuario
        const resUser = await fetch(`${URL}/rest/v1/users?dni=eq.${dni}&select=id,full_name,cuota_pagada,mensaje_motivador,role`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const users = await resUser.json();
        if (!users || !users.length) return res.json({ success: false, message: "❌ DNI no registrado." });
        
        const user = users[0];
        const userRole = (user.role || 'estudiante').toLowerCase();

        // 2. Buscamos si ya está 'presente'
        const resAtt = await fetch(`${URL}/rest/v1/attendance?user_id=eq.${user.id}&status=eq.presente&select=id`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const reg = await resAtt.json();

        let infoExtra = "";
        if (userRole === 'barbero') {
            infoExtra = `✂️ Staff Barbería | ${user.mensaje_motivador || "¡Buen turno!"}`;
        } else {
            infoExtra = `${user.cuota_pagada ? "✅ Cuota al Día" : "⚠️ Cuota Pendiente"} | ${user.mensaje_motivador || "¡Dale con todo!"}`;
        }

        if (reg && reg.length > 0) {
            // --- MARCAR SALIDA ---
            await fetch(`${URL}/rest/v1/attendance?id=eq.${reg[0].id}`, {
                method: 'PATCH',
                headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
                body: JSON.stringify({ 
                    check_out: new Date().toISOString(), 
                    status: 'completado' 
                })
            });
            const msgSalida = userRole === 'barbero' ? `👋 ¡Buen descanso, ${user.full_name}!` : `👋 ¡Adiós, ${user.full_name}!`;
            res.json({ success: true, message: msgSalida, extra: infoExtra });
        } else {
            // --- MARCAR ENTRADA ---
            await fetch(`${URL}/rest/v1/attendance`, {
                method: 'POST',
                headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
                body: JSON.stringify({ 
                    user_id: user.id, 
                    check_in: new Date().toISOString(),
                    status: 'presente' 
                })
            });
            res.json({ success: true, message: `✅ ¡Hola, ${user.full_name}!`, extra: infoExtra });
        }
    } catch (e) {
        res.json({ success: false, message: "❌ Error de conexión." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
