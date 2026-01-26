require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

const supabaseHeaders = {
    "apikey": KEY,
    "Authorization": `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
};

// --- RUTA: CIERRE DE CAJA ---
app.post('/api/cierre', async (req, res) => {
    const { efectivo, tarjetas, gastos, comisiones, neto } = req.body;
    const fechaHoy = new Date().toLocaleString('es-AR');

    try {
        // Guarda los datos en la tabla que acabas de crear en Supabase
        await fetch(`${URL}/rest/v1/daily_reports`, {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify({ 
                cash: efectivo, 
                cards: tarjetas, 
                expenses: gastos, 
                commissions: comisiones, 
                total_net: neto
            })
        });

        // Prepara el mensaje para WhatsApp
        const mensajeWA = `*📊 CIERRE SMARTBARBER*%0A` +
                          `📅 *Fecha:* ${fechaHoy}%0A` +
                          `💵 *Efectivo:* $${efectivo}%0A` +
                          `💳 *Tarjetas:* $${tarjetas}%0A` +
                          `🧧 *Gastos:* $${gastos}%0A` +
                          `💰 *NETO: $${neto}*`;

        res.json({ success: true, textoWA: mensajeWA });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// --- RUTA: ASISTENCIA ---
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
                headers: supabaseHeaders,
                body: JSON.stringify({ check_out: new Date().toISOString(), status: 'completado' })
            });
            res.json({ success: true, message: `👋 Salida: ${user.full_name}`, tipo: 'SALIDA' });
        } else {
            await fetch(`${URL}/rest/v1/attendance`, {
                method: 'POST',
                headers: supabaseHeaders,
                body: JSON.stringify({ user_id: user.id, status: 'presente' })
            });
            res.json({ success: true, message: `✅ Entrada: ${user.full_name}`, tipo: 'ENTRADA' });
        }
    } catch (e) { res.json({ success: false, message: "❌ Error de conexión." }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));
