import { routeHandler } from '../../core/utils/routeHandler.js';
import { resolveProjectIdentity } from '../domains/project/project.service.js';
import { recordActivity } from '../domains/activity/activity.service.js';
import { recordMetric } from '../domains/metrics/metrics.service.js';
import {
  createContext,
  getContextById,
  searchContexts,
  updateContext,
  getContextVersions,
  getConnectedContextData,
  upsertProjectDescriptor,
  buildProjectDescriptorFilter,
  rankSearchResults
} from '../domains/memory/memory.service.js';
import { registerAgent, heartbeatAgent, listAgents } from '../domains/agent/agent.service.js';
import {
  createTask,
  updateTask,
  assignTask,
  fetchTasks,
  buildDerivedTaskState,
  syncAgentTaskState
} from '../domains/task/task.service.js';
import { createIssue, resolveIssue, fetchIssues } from '../domains/issue/issue.service.js';
import {
  createFeedback,
  getFeedbackById,
  listFeedbacks,
  voteFeedback,
  resolveFeedback,
  updateFeedbackSeverity,
  createFeedbackFromTestFailure,
  createImprovementFromPattern
} from '../domains/feedback/feedback.service.js';
import {
  createRoom,
  getRoomById,
  listRooms,
  joinRoom,
  leaveRoom,
  sendMessage,
  getMessages,
  getRecentMessages,
  broadcastToRoom,
  announceTaskTakeover,
  requestHelpInRoom,
  shareFindingInRoom,
  getOrCreateDefaultRoom,
  CHAT_MESSAGE_TYPE
} from '../domains/chat/chat.service.js';
import { getEmulatorPlugin } from '../../plugins/emulator/index.js';
import { hasText, parsePositiveInt, toStringArray } from '../database/models.js';

export function registerAllRoutes(app, db) {
  app.post(
    '/context',
    routeHandler('contexts', async ({ req, collection }) => {
      const isProjectDescriptor =
        req.body.type === 'project' || Boolean(req.body.projectDescriptor);
      const actor = req.body.agent || 'system';

      if (isProjectDescriptor) {
        const context = await upsertProjectDescriptor(db, req.body);
        return { success: true, context };
      }

      const context = await createContext(db, req.body);
      const stored = await getContextById(db, context.insertedId);
      return { success: true, context: stored };
    })
  );

  app.get(
    '/project/descriptor',
    routeHandler('contexts', async ({ req, collection }) => {
      const context = await collection.findOne(buildProjectDescriptorFilter(req.query.project));
      return context || { error: 'Project descriptor not found' };
    })
  );

  app.post(
    '/project/descriptor',
    routeHandler('contexts', async ({ req, db: database }) => {
      const context = await upsertProjectDescriptor(database, req.body);
      return { success: true, context };
    })
  );

  app.post(
    '/context/search',
    routeHandler('contexts', async ({ req, collection, db: database }) => {
      const { agent, project, query = '', limit = 10, lifecycle } = req.body;

      const results = await searchContexts(database, { agent, project, query, limit, lifecycle });
      const ranked = rankSearchResults(results, query).slice(0, limit);

      return ranked;
    })
  );

  app.post(
    '/context/update',
    routeHandler('contexts', async ({ req, db: database }) => {
      const { context_id, updates = {}, reason } = req.body;
      const context = await updateContext(database, context_id, updates, {
        reason,
        changedBy: req.body.agent
      });
      return { success: true, context };
    })
  );

  app.get(
    '/context/:id/full',
    routeHandler('contexts', async ({ req, db: database }) => {
      const data = await getConnectedContextData(database, req.params.id);
      return data || { error: 'Context not found' };
    })
  );

  app.get(
    '/context/:id/connected',
    routeHandler('contexts', async ({ req, db: database }) => {
      const data = await getConnectedContextData(database, req.params.id);
      return data || { error: 'Context not found' };
    })
  );

  app.post(
    '/agent/register',
    routeHandler('agents', async ({ req, collection, db: database }) => {
      const agent = await registerAgent(database, req.body);
      return { success: true, agent };
    })
  );

  app.post(
    '/agent/heartbeat',
    routeHandler('agents', async ({ req, collection, db: database }) => {
      const agent = await heartbeatAgent(database, req.body);
      return { success: true, agent };
    })
  );

  app.get(
    '/agent/list',
    routeHandler('agents', async ({ req, collection, db: database }) => {
      const agents = await listAgents(database, { project: req.query.project });
      return agents;
    })
  );

  app.post(
    '/task',
    routeHandler('tasks', async ({ req, collection, db: database }) => {
      const task = await createTask(database, req.body);
      return { success: true, task };
    })
  );

  app.post(
    '/task/update',
    routeHandler('tasks', async ({ req, db: database }) => {
      const task = await updateTask(database, req.body);
      return { success: true, task };
    })
  );

  app.post(
    '/task/assign',
    routeHandler('tasks', async ({ req, db: database }) => {
      const task = await assignTask(database, req.body);
      return { success: true, task };
    })
  );

  app.get(
    '/task/list',
    routeHandler('tasks', async ({ req, collection }) => {
      const tasks = await fetchTasks(collection, {
        project: req.query.project,
        assigned_to: req.query.assigned_to,
        created_by: req.query.created_by,
        status: req.query.status,
        include_completed: req.query.include_completed,
        limit: parsePositiveInt(req.query.limit, 50)
      });
      return tasks;
    })
  );

  app.post(
    '/issue',
    routeHandler('issues', async ({ req, db: database }) => {
      const issue = await createIssue(database, req.body);
      return { success: true, issue };
    })
  );

  app.post(
    '/issue/resolve',
    routeHandler('issues', async ({ req, db: database }) => {
      const issue = await resolveIssue(database, req.body);
      return { success: true, issue };
    })
  );

  app.get(
    '/issue/list',
    routeHandler('issues', async ({ req, collection }) => {
      const issues = await fetchIssues(collection, {
        project: req.query.project,
        status: req.query.status,
        type: req.query.type,
        related_task: req.query.related_task
      });
      return issues;
    })
  );

  app.post(
    '/feedback',
    routeHandler('feedbacks', async ({ req, db: database }) => {
      const result = await createFeedback(database, req.body);
      const feedback = await getFeedbackById(database, result.insertedId);
      return { success: true, feedback };
    })
  );

  app.get(
    '/feedback/list',
    routeHandler('feedbacks', async ({ req, db: database }) => {
      const feedbacks = await listFeedbacks(database, {
        project: req.query.project,
        type: req.query.type,
        status: req.query.status,
        severity: req.query.severity ? parseInt(req.query.severity, 10) : undefined,
        limit: parsePositiveInt(req.query.limit, 50)
      });
      return feedbacks;
    })
  );

  app.post(
    '/feedback/vote',
    routeHandler('feedbacks', async ({ req, db: database }) => {
      const feedback = await voteFeedback(
        database,
        req.body.feedback_id,
        req.body.voter_id || 'system'
      );
      return { success: true, feedback };
    })
  );

  app.post(
    '/feedback/resolve',
    routeHandler('feedbacks', async ({ req, db: database }) => {
      const feedback = await resolveFeedback(
        database,
        req.body.feedback_id,
        req.body.resolved_by || 'system',
        req.body.resolution
      );
      return { success: true, feedback };
    })
  );

  app.post(
    '/feedback/severity',
    routeHandler('feedbacks', async ({ req, db: database }) => {
      const feedback = await updateFeedbackSeverity(
        database,
        req.body.feedback_id,
        req.body.severity
      );
      return { success: true, feedback };
    })
  );

  app.post(
    '/feedback/test-failure',
    routeHandler('feedbacks', async ({ req, db: database }) => {
      const result = await createFeedbackFromTestFailure(database, req.body);
      const feedback = await getFeedbackById(database, result.insertedId);
      return { success: true, feedback };
    })
  );

  app.post(
    '/chat/room',
    routeHandler('chat_rooms', async ({ req, db: database }) => {
      const result = await createRoom(database, req.body);
      const room = await getRoomById(database, result.insertedId);
      return { success: true, room };
    })
  );

  app.get(
    '/chat/room/list',
    routeHandler('chat_rooms', async ({ req, db: database }) => {
      const rooms = await listRooms(database, {
        project: req.query.project,
        is_active: req.query.is_active,
        limit: parsePositiveInt(req.query.limit, 50)
      });
      return rooms;
    })
  );

  app.post(
    '/chat/room/:room_id/join',
    routeHandler('chat_rooms', async ({ req, db: database }) => {
      const room = await joinRoom(database, req.params.room_id, req.body.agent_id || 'system');
      return { success: true, room };
    })
  );

  app.post(
    '/chat/message',
    routeHandler('chat_messages', async ({ req, db: database }) => {
      await sendMessage(database, req.body);
      return { success: true };
    })
  );

  app.get(
    '/chat/room/:room_id/messages',
    routeHandler('chat_messages', async ({ req, db: database }) => {
      const messages = await getMessages(database, {
        room_id: req.params.room_id,
        limit: parsePositiveInt(req.query.limit, 100)
      });
      return messages;
    })
  );

  app.post(
    '/emulator/scan',
    routeHandler('activity', async () => {
      const emulatorPlugin = getEmulatorPlugin();
      const emulators = await emulatorPlugin.scan();
      return { success: true, emulators };
    })
  );

  app.post(
    '/emulator/select',
    routeHandler('activity', async ({ req }) => {
      const emulatorPlugin = getEmulatorPlugin();
      const { emulator_id, requirements } = req.body;
      if (emulator_id) {
        return await emulatorPlugin.select(emulator_id);
      }
      return await emulatorPlugin.autoSelect(requirements || {});
    })
  );

  app.post(
    '/emulator/install',
    routeHandler('activity', async ({ req }) => {
      const emulatorPlugin = getEmulatorPlugin();
      return await emulatorPlugin.installApp(
        req.body.session_id,
        req.body.apk_path,
        req.body.package_name
      );
    })
  );

  app.post(
    '/emulator/test',
    routeHandler('activity', async ({ req }) => {
      const emulatorPlugin = getEmulatorPlugin();
      return await emulatorPlugin.runTest(
        req.body.session_id,
        req.body.test_package,
        req.body.test_class,
        req.body.options
      );
    })
  );

  app.post(
    '/emulator/logs',
    routeHandler('activity', async ({ req }) => {
      const emulatorPlugin = getEmulatorPlugin();
      return await emulatorPlugin.captureLogs(req.body.session_id, req.body);
    })
  );

  app.post(
    '/emulator/screenshot',
    routeHandler('activity', async ({ req }) => {
      const emulatorPlugin = getEmulatorPlugin();
      return await emulatorPlugin.takeScreenshot(req.body.session_id, req.body.path);
    })
  );

  app.post(
    '/emulator/input',
    routeHandler('activity', async ({ req }) => {
      const emulatorPlugin = getEmulatorPlugin();
      return await emulatorPlugin.simulateInput(
        req.body.session_id,
        req.body.action,
        req.body.params || {}
      );
    })
  );

  app.get(
    '/metrics',
    routeHandler('metrics', async ({ req, collection }) => {
      return collection.find({}).limit(parsePositiveInt(req.query.limit, 100)).toArray();
    })
  );

  app.get(
    '/project-map',
    routeHandler('project_map', async ({ req, collection }) => {
      const filter = {};
      if (req.query.project) filter.project = req.query.project;
      if (req.query.type) filter.type = req.query.type;
      return collection.find(filter).limit(parsePositiveInt(req.query.limit, 100)).toArray();
    })
  );

  app.get('/', (_req, res) => {
    res.send('MCP Memory Server Running');
  });
}

export function getIdentityFromRequest(req) {
  return resolveProjectIdentity();
}
