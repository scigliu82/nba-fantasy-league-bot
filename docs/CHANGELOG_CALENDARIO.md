# 🔧 CORREZIONI SISTEMA CALENDARIO

## ✅ MODIFICHE IMPLEMENTATE

### **1. Annunci in #📰-announcements**

**PRIMA:**
- I risultati venivano pubblicati in `#📅-calendario`
- Il canale calendario si riempiva di messaggi

**DOPO:**
- I risultati vengono pubblicati in `#📰-announcements` (read-only)
- Il canale `#📅-calendario` resta pulito con solo gli embed dei turni

---

### **2. Update automatico embed turno**

**PRIMA:**
```
• Golden State Warriors vs Oklahoma City Thunder - ⏳ Da giocare
```
(Rimaneva "Da giocare" anche dopo aver inserito il risultato)

**DOPO:**
```
• Golden State Warriors vs Oklahoma City Thunder - ✅ 50-60
```
(L'embed si aggiorna automaticamente con il risultato)

**Come funziona:**
1. Quando pubblichi il calendario con `/season setup_schedule`, il bot salva i `message_id` di ogni turno nel database
2. Quando inserisci un risultato con `/result add`, il bot:
   - Aggiorna il database
   - Fetcha il messaggio del turno corrispondente
   - Rigenera l'embed con i risultati aggiornati
   - Edita il messaggio in `#📅-calendario`

---

### **3. Sovrascrittura risultati duplicati**

**Comportamento:**
- Se inserisci un risultato per una partita già giocata, il bot sovrascrive il risultato precedente
- L'embed del turno in `#📅-calendario` mostra SEMPRE il risultato più recente
- Viene creato un nuovo annuncio in `#📰-announcements` (per tracciabilità)

**Esempio:**
```
/result add round:1 home_team:warriors away_team:thunder home_score:50 away_score:60
(Embed aggiornato: Warriors vs Thunder - ✅ 50-60)

/result add round:1 home_team:warriors away_team:thunder home_score:55 away_score:60
(Embed aggiornato: Warriors vs Thunder - ✅ 55-60)  ← Sovrascrive
```

---

## 📊 DATABASE SCHEMA AGGIORNATO

### **Collection: schedules**

```javascript
{
  season: "2025-26",
  format: 29,
  total_games: 431,
  rounds: 29,
  games: [...],
  
  // ⬇️ NUOVO
  calendar_messages: {
    "1": "1234567890",    // message_id del turno 1
    "2": "1234567891",    // message_id del turno 2
    "3": "1234567892",    // message_id del turno 3
    // ... fino a 29
  },
  calendar_channel_id: "1234567888",  // ID del canale #calendario
  
  created_at: timestamp,
  updated_at: timestamp,
  status: "active"
}
```

---

## 🔄 WORKFLOW COMPLETO

### **Setup iniziale:**

1. **Crea server**
   ```
   /setup server
   ```
   Crea: `#📰-announcements` (read-only) + `#📅-calendario`

2. **Importa calendario**
   ```
   /season setup_schedule format:29
   ```
   - Importa 431 partite in Firestore
   - Pubblica 29 embed (1 per turno) in `#📅-calendario`
   - Salva i message_id nel database

---

### **Inserimento risultati:**

3. **Aggiungi risultato**
   ```
   /result add round:1 home_team:warriors away_team:thunder home_score:110 away_score:105
   ```
   
   **Cosa succede:**
   
   ✅ **Step 1:** Aggiorna il database (game.played = true, scores salvati)
   
   ✅ **Step 2:** Fetcha il messaggio del Turno 1 in `#📅-calendario`
   
   ✅ **Step 3:** Rigenera l'embed del Turno 1 con i nuovi risultati:
   ```
   🏀 TURNO 1
   
   • Atlanta Hawks vs Washington Wizards - ⏳ Da giocare
   • Boston Celtics vs Utah Jazz - ⏳ Da giocare
   • Warriors vs Thunder - ✅ 110-105  ← AGGIORNATO
   • ...
   ```
   
   ✅ **Step 4:** Edita il messaggio in `#📅-calendario`
   
   ✅ **Step 5:** Posta annuncio in `#📰-announcements`:
   ```
   🏀 GAME RESULT
   Round 1
   
   Golden State Warriors 110 - 105 Oklahoma City Thunder
   
   🏆 Golden State Warriors
   ```

---

## 🎯 CANALI E LORO FUNZIONI

| Canale | Funzione | Contenuto |
|--------|----------|-----------|
| `#📅-calendario` | Calendario statico con update automatico | 29 embed (1 per turno) che si aggiornano quando inserisci risultati |
| `#📰-announcements` | Feed annunci read-only | Ogni risultato inserito appare qui come announcement |
| `#📊-standings` | Classifiche (da implementare) | Auto-update standings dopo ogni risultato |

---

## 🧪 TEST

### **Test 1: Pubblica calendario**
```
/season setup_schedule format:29
```

**Verifica in #📅-calendario:**
- ✅ 29 messaggi embed (1 per turno)
- ✅ Ogni partita mostra "⏳ Da giocare"

**Verifica in Firebase:**
- ✅ Document `schedules/2025-26` contiene `calendar_messages` con 29 message_id

---

### **Test 2: Inserisci primo risultato**
```
/result add round:1 home_team:hawks away_team:wizards home_score:112 away_score:108
```

**Verifica in #📅-calendario:**
- ✅ Il messaggio del Turno 1 si è aggiornato
- ✅ Hawks vs Wizards mostra "✅ 112-108"

**Verifica in #📰-announcements:**
- ✅ Nuovo messaggio "🏀 GAME RESULT" con il risultato

---

### **Test 3: Correggi risultato (duplicato)**
```
/result add round:1 home_team:hawks away_team:wizards home_score:115 away_score:108
```

**Verifica in #📅-calendario:**
- ✅ Il messaggio del Turno 1 si è aggiornato
- ✅ Hawks vs Wizards mostra "✅ 115-108" (NUOVO)

**Verifica in #📰-announcements:**
- ✅ Nuovo messaggio con risultato corretto (il vecchio resta per storico)

---

## 📂 FILE MODIFICATI

1. ✅ **setup-schedule.js** - Salva message_id quando pubblica calendario
2. ✅ **result-add.js** - Update embed calendario + annunci in announcements

---

## 🚀 INSTALLAZIONE

**Sostituisci i file:**
```bash
copy setup-schedule.js src\commands\admin\setup-schedule.js
copy result-add.js src\commands\info\result-add.js
```

**Riavvia il bot:**
```bash
npm start
```

**Ri-importa il calendario:**
```
/season setup_schedule format:29
```
(Necessario per salvare i message_id nel database)

**Testa inserimento risultato:**
```
/result add round:1 home_team:lakers away_team:celtics home_score:110 away_score:105
```

---

## ⚠️ NOTA IMPORTANTE

**Se hai già importato il calendario PRIMA di questo fix:**

Devi **re-importare** il calendario con `/season setup_schedule format:29` perché:
- I vecchi embed non hanno i message_id salvati nel database
- Il bot non può aggiornarli senza i message_id

**Workflow:**
1. Cancella i vecchi messaggi in `#📅-calendario` (o lasciali, verranno sovrascritti)
2. Lancia `/season setup_schedule format:29`
3. Il bot pubblica nuovi embed e salva i message_id
4. Ora `/result add` può aggiornare gli embed!

---

**🎉 Correzioni completate!** 🏀