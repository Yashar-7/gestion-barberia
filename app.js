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

// API PARA OBTENER LOS PRESENTES
app.get('/api/presentes', async (req, res) => {
    try {
        const response = await fetch(`${URL}/rest/v1/attendance?select=*,users(full_name,cuota_pagada,role)&status=eq.presente`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) { res.status(500).json([]); }
});

// LÓGICA DE ASISTENCIA
app.post('/asistencia', async (req, res) => {
    const { dni } = req.body;
    try {
        // 1. Buscamos al usuario
        const resUser = await fetch(`${URL}/rest/v1/users?dni=eq.${dni}&select=id,full_name,cuota_pagada,mensaje_motivador,role`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const users = await resUser.json();
        if (!users || !users.length) return res.json({ success: false, message: "❌ DNI no registrado." });
        
        const user = users[0];
        const userRole = (user.role || 'estudiante').toLowerCase();

        // 2. Buscamos si ya tiene una entrada abierta (status 'presente')
        const resAtt = await fetch(`${URL}/rest/v1/attendance?user_id=eq.${user.id}&status=eq.presente&select=id`, {
            headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
        });
        const registros = await resAtt.json();

        let infoExtra = "";
        if (userRole === 'barbero') {
            infoExtra = `✂️ Staff Barbería | ${user.mensaje_motivador || "¡Buen turno!"}`;
        } else {
            infoExtra = `${user.cuota_pagada ? "✅ Cuota al Día" : "⚠️ Cuota Pendiente"} | ${user.mensaje_motivador || "¡Dale con todo!"}`;
        }

        if (registros && registros.length > 0) {
            // --- MARCAR SALIDA ---
            // Ahora que la columna check_out existe, el PATCH funcionará
            await fetch(`${URL}/rest/v1/attendance?id=eq.${registros[0].id}`, {
                method: 'PATCH',
                headers: { 
                    "apikey": KEY, 
                    "Authorization": `Bearer ${KEY}`, 
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({ 
                    check_out: new Date().toISOString(), 
                    status: 'completado' 
                })
            });
            const msg = userRole === 'barbero' ? `👋 ¡Buen descanso, ${user.full_name}!` : `👋 ¡Adiós, ${user.full_name}!`;
            res.json({ success: true, message: msg, extra: infoExtra });
        } else {
            // --- MARCAR ENTRADA ---
            await fetch(`${URL}/rest/v1/attendance`, {
                method: 'POST',
                headers: { 
                    "apikey": KEY, 
                    "Authorization": `Bearer ${KEY}`, 
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({ 
                    user_id: user.id, 
                    status: 'presente',
                    check_in: new Date().toISOString()
                })
            });
            res.json({ success: true, message: `✅ ¡Hola, ${user.full_name}!`, extra: infoExtra });
        }
    } catch (e) {
        res.json({ success: false, message: "❌ Error de conexión." });
    }
});

// Mantén tus rutas de /api/usuarios/pagar, /api/usuarios/:id y /api/usuarios igual...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
