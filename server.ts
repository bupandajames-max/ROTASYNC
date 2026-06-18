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

Provide exactly 4 to 6 core operational tasks suitable for scheduling in a rostering system.
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
        model: 'gemini-3.5-flash',
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
                  required: ['name', 'pattern', 'priority', 'frequency', 'notes', 'assignedValue']
                }
              }
            },
            required: ['description', 'tasks']
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
