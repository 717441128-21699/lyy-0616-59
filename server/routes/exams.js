const express = require('express');
const { findOne, findMany, insert, update, remove, getById } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  let exams;
  
  if (req.user.role === 'teacher') {
    exams = findMany('exams', e => e.teacher_id === req.user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(e => ({
        ...e,
        teacher_name: findOne('users', u => u.id === e.teacher_id)?.name,
        question_count: findMany('questions', q => q.exam_id === e.id).length
      }));
  } else {
    exams = findMany('exams', e => e.status === 'published')
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
      .map(e => {
        const enrollment = findOne('exam_enrollments', en => en.exam_id === e.id && en.student_id === req.user.id);
        return {
          ...e,
          teacher_name: findOne('users', u => u.id === e.teacher_id)?.name,
          question_count: findMany('questions', q => q.exam_id === e.id).length,
          enrollment_status: enrollment ? enrollment.status : 'not_enrolled'
        };
      });
  }

  res.json({ exams });
});

router.get('/:id', authenticateToken, (req, res) => {
  const exam = getById('exams', req.params.id);

  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  const teacher = findOne('users', u => u.id === exam.teacher_id);
  exam.teacher_name = teacher?.name;

  const questions = findMany('questions', q => q.exam_id === exam.id)
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
    .map(q => {
      const qCopy = { ...q };
      if (qCopy.options) {
        qCopy.options = JSON.parse(qCopy.options);
      }
      if (req.user.role === 'student') {
        delete qCopy.answer;
      }
      return qCopy;
    });

  exam.questions = questions;

  if (req.user.role === 'student') {
    const enrollment = findOne('exam_enrollments', en => en.exam_id === exam.id && en.student_id === req.user.id);
    exam.enrollment = enrollment || null;
  }

  res.json({ exam });
});

router.post('/', authenticateToken, requireRole('teacher'), (req, res) => {
  const {
    title, description, start_time, end_time, duration,
    allow_review, max_window_switches, face_detection_enabled, screen_share_required
  } = req.body;

  if (!title || !start_time || !end_time || !duration) {
    return res.status(400).json({ error: '请填写必填项' });
  }

  const exam = insert('exams', {
    title,
    description: description || '',
    teacher_id: req.user.id,
    start_time,
    end_time,
    duration,
    allow_review: allow_review ? 1 : 0,
    max_window_switches: max_window_switches || 3,
    face_detection_enabled: face_detection_enabled ? 1 : 0,
    screen_share_required: screen_share_required ? 1 : 0,
    status: 'draft'
  });

  res.json({ id: exam.id, message: '考试创建成功' });
});

router.put('/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  const exam = getById('exams', req.params.id);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权修改此考试' });
  }

  const {
    title, description, start_time, end_time, duration,
    allow_review, max_window_switches, face_detection_enabled, screen_share_required, status
  } = req.body;

  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (start_time !== undefined) updateData.start_time = start_time;
  if (end_time !== undefined) updateData.end_time = end_time;
  if (duration !== undefined) updateData.duration = duration;
  if (allow_review !== undefined) updateData.allow_review = allow_review ? 1 : 0;
  if (max_window_switches !== undefined) updateData.max_window_switches = max_window_switches;
  if (face_detection_enabled !== undefined) updateData.face_detection_enabled = face_detection_enabled ? 1 : 0;
  if (screen_share_required !== undefined) updateData.screen_share_required = screen_share_required ? 1 : 0;
  if (status !== undefined) updateData.status = status;

  update('exams', req.params.id, updateData);

  res.json({ message: '考试更新成功' });
});

router.delete('/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  const exam = getById('exams', req.params.id);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权删除此考试' });
  }

  removeMany('questions', q => q.exam_id === parseInt(req.params.id));
  removeMany('exam_enrollments', en => en.exam_id === parseInt(req.params.id));
  removeMany('answers', a => {
    const enrollments = findMany('exam_enrollments', en => en.exam_id === parseInt(req.params.id));
    return enrollments.some(en => en.id === a.enrollment_id);
  });
  removeMany('cheating_events', ce => ce.exam_id === parseInt(req.params.id));
  removeMany('behavior_logs', bl => bl.exam_id === parseInt(req.params.id));
  
  remove('exams', req.params.id);
  res.json({ message: '考试删除成功' });
});

router.post('/:id/questions', authenticateToken, requireRole('teacher'), (req, res) => {
  const exam = getById('exams', req.params.id);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权修改此考试' });
  }

  const { type, content, options, answer, score, order_index } = req.body;

  if (!type || !content) {
    return res.status(400).json({ error: '请填写题目类型和内容' });
  }

  const question = insert('questions', {
    exam_id: parseInt(req.params.id),
    type,
    content,
    options: options ? JSON.stringify(options) : null,
    answer: answer || null,
    score: score || 10,
    order_index: order_index || 0
  });

  res.json({ id: question.id, message: '题目添加成功' });
});

router.put('/:id/questions/:questionId', authenticateToken, requireRole('teacher'), (req, res) => {
  const question = getById('questions', req.params.questionId);
  
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }

  const exam = getById('exams', question.exam_id);
  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权修改此题目' });
  }

  const { type, content, options, answer, score, order_index } = req.body;

  const updateData = {};
  if (type !== undefined) updateData.type = type;
  if (content !== undefined) updateData.content = content;
  if (options !== undefined) updateData.options = options ? JSON.stringify(options) : null;
  if (answer !== undefined) updateData.answer = answer;
  if (score !== undefined) updateData.score = score;
  if (order_index !== undefined) updateData.order_index = order_index;

  update('questions', req.params.questionId, updateData);

  res.json({ message: '题目更新成功' });
});

router.delete('/:id/questions/:questionId', authenticateToken, requireRole('teacher'), (req, res) => {
  const question = getById('questions', req.params.questionId);
  
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }

  const exam = getById('exams', question.exam_id);
  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权删除此题目' });
  }

  remove('questions', req.params.questionId);
  res.json({ message: '题目删除成功' });
});

module.exports = router;
