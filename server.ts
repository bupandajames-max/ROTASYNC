import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  // App Hosting / Cloud Run inject PORT at runtime; fall back to 3000 locally.
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Route for Gemini to suggest tasks & objectives
  app.post('/api/suggest-department-tasks', async (req, res) => {
    try {
      const { departmentName, userDescription } = req.body;

      if (!departmentName) {
        return res.status(400).json({ error: 'Department name is required' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: 'GEMINI_API_KEY environment variable is not configured. Please set it in Settings > Secrets.' 
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are an expert operations consultant. Generate a tailored description and a list of ideal operational tasks and responsibilities for a new business/operational department named "${departmentName}".
${userDescription ? `The user provided the following additional description/context: "${userDescription}".` : ''}

First, propose a concise taxonomy of 3 to 5 operational CATEGORIES that best organize the work of this specific department (e.g. for a Marketing dept: "Campaign Execution", "Content", "Analytics"; for a Warehouse: "Receiving", "Picking & Packing", "Safety"). Categories must be tailored to "${departmentName}" — do NOT reuse generic clinical/pharmacy categories unless the department is genuinely clinical. Each category name should be 1-3 words, Title Case.

Then provide exactly 4 to 6 core operational tasks suitable for scheduling in a rostering system. Every task must be tagged with exactly one category from the taxonomy you proposed above.
Each task must belong to one of these execution patterns:
- 'Shift-based'
- 'Role-group'
- 'Linked'
- 'Collab'
- 'Person-specific'
- 'Manager-assign'
- 'Dispensing-rotate'

Each task details should include:
- A descriptive name (e.g. "Inventory Check", "Safety Inspection", "Daily Store Register Closure", etc.)
- A suitable execution pattern from the list above.
- A suitable assigned value (e.g. "Shift A", "Shift E", "All Working Staff", or "Manager")
- A high-contrast priority ('Critical', 'High', 'Standard', 'Routine')
- A frequency category ('Daily', 'Weekly', 'Monthly', 'Custom')
- Practical guidelines/notes describing the expectations, compliance criteria, or execution metrics of this task.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: 'A professional, detailed description of the department, explaining its core purpose, objectives, and administrative boundaries.',
              },
              categories: {
                type: Type.ARRAY,
                description: 'A tailored taxonomy of 3 to 5 operational category names for this department, Title Case, 1-3 words each.',
                items: { type: Type.STRING },
              },
              tasks: {
                type: Type.ARRAY,
                description: 'A list of 4 to 6 ideal core operational tasks for this department.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Task name'
                    },
                    category: {
                      type: Type.STRING,
                      description: 'One category name, taken exactly from the categories taxonomy above.',
                    },
                    pattern: {
                      type: Type.STRING, 
                      enum: ['Shift-based', 'Role-group', 'Linked', 'Collab', 'Person-specific', 'Manager-assign', 'Dispensing-rotate'],
                      description: 'The execution pattern.' 
                    },
                    priority: { 
                      type: Type.STRING, 
                      enum: ['Critical', 'High', 'Standard', 'Routine'],
                      description: 'The importance/priority level.' 
                    },
                    frequency: { 
                      type: Type.STRING, 
                      description: 'How often the task is performed (e.g., Daily, Weekly, Monthly etc.)' 
                    },
                    notes: { 
                      type: Type.STRING, 
                      description: 'Clear, practical guidelines on how to execute or verify this task.' 
                    },
                    assignedValue: { 
                      type: Type.STRING, 
                      description: 'Draft assignment, e.g., "Shift A", "Shift E", or "All Staff".' 
                    }
                  },
                  required: ['name', 'category', 'pattern', 'priority', 'frequency', 'notes', 'assignedValue']
                }
              }
            },
            required: ['description', 'categories', 'tasks']
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response received from Gemini API');
      }

      const payload = JSON.parse(responseText.trim());
      res.json(payload);
    } catch (error: any) {
      console.error('Error generating suggestions:', error);
      res.status(500).json({ error: error?.message || 'An error occurred during Gemini suggestion generation.' });
    }
  });

  // API Route: suggest concrete tasks for a single category, in context.
  app.post('/api/suggest-category-tasks', async (req, res) => {
    try {
      const { category, taskName, departmentName, facilityType, existingTaskNames } = req.body;

      if (!category && !taskName) {
        return res.status(400).json({ error: 'A category or task name is required' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY environment variable is not configured. Please set it in Settings > Secrets.'
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const existing: string[] = Array.isArray(existingTaskNames) ? existingTaskNames : [];
      const named = typeof taskName === 'string' && taskName.trim().length > 0 ? taskName.trim() : '';
      const prompt = `You are an expert operations consultant helping define operational tasks${category ? ` under the category "${category}"` : ''}.
${named
  ? `The user is creating a task and has typed: "${named}". Make the FIRST suggestion a clean, well-formed version of exactly that task, then add 4-7 closely related tasks. Bias every suggestion toward "${named}".`
  : 'List the concrete, real-world operational tasks routinely carried out under this category.'}
${departmentName ? `Context: performed by the "${departmentName}" department.` : ''}
${facilityType ? `The site is a "${facilityType}".` : ''}
${existing.length ? `Do NOT repeat any of these existing tasks: ${existing.join('; ')}.` : ''}

Provide 5 to 8 distinct tasks suitable for scheduling in a rostering system. For each task:
- A concise, action-oriented name (e.g. "Cycle Count Reconciliation", "Expiry / FEFO Check").
- A suitable execution pattern from: 'Auto', 'Shift-based', 'Role-group', 'Linked', 'Collab', 'Person-specific', 'Manager-assign', 'Dispensing-rotate'. Prefer 'Auto' for routine tasks that any qualified person on shift can do.
- A priority: 'Critical', 'High', 'Standard', 'Routine'.
- A frequency: 'Daily', 'Weekly', 'Monthly', or 'Custom'.
- Practical guidelines/notes describing how to execute or verify the task.
- requiredSkills: 0-3 specific competencies a person must hold to perform it (empty array if none needed).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                description: 'A list of 5 to 8 concrete tasks for this category.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Task name' },
                    pattern: {
                      type: Type.STRING,
                      enum: ['Auto', 'Shift-based', 'Role-group', 'Linked', 'Collab', 'Person-specific', 'Manager-assign', 'Dispensing-rotate'],
                      description: 'The execution pattern.'
                    },
                    priority: {
                      type: Type.STRING,
                      enum: ['Critical', 'High', 'Standard', 'Routine'],
                      description: 'The importance/priority level.'
                    },
                    frequency: { type: Type.STRING, description: 'How often the task is performed.' },
                    notes: { type: Type.STRING, description: 'Practical execution/verification guidelines.' },
                    requiredSkills: {
                      type: Type.ARRAY,
                      description: '0-3 competencies needed to perform the task.',
                      items: { type: Type.STRING },
                    }
                  },
                  required: ['name', 'pattern', 'priority', 'frequency', 'notes', 'requiredSkills']
                }
              }
            },
            required: ['tasks']
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response received from Gemini API');
      }

      const payload = JSON.parse(responseText.trim());
      res.json(payload);
    } catch (error: any) {
      console.error('Error generating category task suggestions:', error);
      res.status(500).json({ error: error?.message || 'An error occurred during Gemini suggestion generation.' });
    }
  });

  // API Route: send an invite notification email.
  //
  // Access is granted by the invite/membership RECORD (written client-side to
  // Firestore under the manager-only create rule) — this email is purely a
  // best-effort "you've been invited" notification. It is intentionally
  // credential-gated and non-fatal: if no email provider is configured, or the
  // provider call fails, we return 200 { sent: false } so the caller (which has
  // ALREADY created the authoritative invite record) never surfaces a failure
  // for a successful invite. Delivery is a convenience, not the source of truth.
  app.post('/api/send-invite-email', async (req, res) => {
    try {
      const { email, roleLabel, facilityName, organizationName, invitedBy, appUrl } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ sent: false, reason: 'missing-email' });
      }

      const apiKey = process.env.RESEND_API_KEY;
      // A verified sender the provider will accept. Falls back to Resend's
      // shared onboarding sender so a minimal setup (just an API key) still works.
      const from = process.env.INVITE_FROM_EMAIL || 'RotaSync <onboarding@resend.dev>';
      if (!apiKey) {
        // Not an error: the in-app invite already succeeded. Signal clearly so
        // the UI can tell the admin email delivery isn't switched on yet.
        return res.status(200).json({ sent: false, reason: 'email-not-configured' });
      }

      const org = (organizationName && String(organizationName).trim()) || '';
      const site = (facilityName && String(facilityName).trim()) || 'the workspace';
      const heroName = org || site;
      const role = (roleLabel && String(roleLabel).trim()) || 'Member';
      const link = (appUrl && String(appUrl).trim()) || 'https://rotasync.onrender.com';
      const invitedByLine = invitedBy ? `${invitedBy} has invited you` : 'You have been invited';

      const subject = `You're invited to ${heroName} on RotaSync`;
      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
          <h2 style="margin:0 0 4px;font-size:20px;">${heroName}</h2>
          ${org ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;">${site}</p>` : ''}
          <p style="font-size:15px;line-height:1.5;">${invitedByLine} to join <strong>${site}</strong> as a <strong>${role}</strong>.</p>
          <p style="font-size:15px;line-height:1.5;">Sign in with this email address (<strong>${email}</strong>) using Google and your invitation will be waiting — you'll land directly in the right workspace with the right access.</p>
          <p style="margin:24px 0;">
            <a href="${link}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px;display:inline-block;">Open RotaSync</a>
          </p>
          <p style="font-size:12px;color:#94a3b8;line-height:1.5;">If you weren't expecting this, you can ignore this email — no access is granted until you sign in with the invited address.</p>
        </div>`;

      const providerRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [email], subject, html }),
      });

      if (!providerRes.ok) {
        const detail = await providerRes.text().catch(() => '');
        console.error('Invite email provider error:', providerRes.status, detail);
        return res.status(200).json({ sent: false, reason: 'provider-error', status: providerRes.status });
      }
      return res.status(200).json({ sent: true });
    } catch (error: any) {
      console.error('Error sending invite email:', error);
      // Never fail the caller for a notification — the invite record stands.
      return res.status(200).json({ sent: false, reason: 'exception' });
    }
  });

  // Serve Vite in dev mode, or compiled static files in prod mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
