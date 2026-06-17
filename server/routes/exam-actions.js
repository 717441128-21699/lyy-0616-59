const express = require('express');
const { findOne, findMany, insert, update, getById } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/:examId/enroll', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '只有学生可以参加考试' });
  }

  const exam = getById('exams', req.params.examId);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.status !== 'published') {
    return res.status(400).json({ error: '考试未发布' });
  }

  const now = new Date();
  const startTime = new Date(exam.start_time);
  const endTime = new Date(exam.end_time);

  if (now < startTime) {
    return res.status(400).json({ error: '考试尚未开始' });
  }

  if (now > endTime) {
    return res.status(400).json({ error: '考试已结束' });
  }

  const existing = findOne('exam_enrollments', 
    en => en.exam_id === parseInt(req.params.examId) && en.student_id === req.user.id);

  if (existing && existing.status === 'submitted') {
    return res.status(400).json({ error: '您已提交考试' });
  }

  if (existing && existing.status === 'in_progress') {
    return res.json({ enrollment: existing, message: '继续考试' });
  }

  const enrollment = insert('exam_enrollments', {
    exam_id: parseInt(req.params.examId),
    student_id: req.user.id,
    status: 'in_progress',
    start_time: new Date().toISOString(),
    score: null,
    cheating_score: 0
  });

  insert('behavior_logs', {
    enrollment_id: enrollment.id,
    exam_id: parseInt(req.params.examId),
    student_id: req.user.id,
    action_type: 'start_exam',
    action_data: JSON.stringify({ time: new Date().toISOString() })
  });

  res.json({ enrollment, message: '开始考试' });
});

router.post('/:examId/answer/:questionId', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '只有学生可以答题' });
  }

  const { answer } = req.body;

  const enrollment = findOne('exam_enrollments',
    en => en.exam_id === parseInt(req.params.examId) && en.student_id === req.user.id);

  if (!enrollment) {
    return res.status(400).json({ error: '未参加此考试' });
  }

  if (enrollment.status === 'submitted') {
    return res.status(400).json({ error: '考试已提交' });
  }

  const question = findOne('questions',
    q => q.id === parseInt(req.params.questionId) && q.exam_id === parseInt(req.params.examId));
  
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }

  const existingAnswer = findOne('answers',
    a => a.enrollment_id === enrollment.id && a.question_id === parseInt(req.params.questionId));

  if (existingAnswer) {
    update('answers', existingAnswer.id, { answer: answer || '' });
  } else {
    insert('answers', {
      enrollment_id: enrollment.id,
      question_id: parseInt(req.params.questionId),
      answer: answer || '',
      score: null,
      teacher_comment: ''
    });
  }

  insert('behavior_logs', {
    enrollment_id: enrollment.id,
    exam_id: parseInt(req.params.examId),
    student_id: req.user.id,
    action_type: 'answer_question',
    action_data: JSON.stringify({ questionId: req.params.questionId, time: new Date().toISOString() })
  });

  res.json({ message: '答案已保存' });
});

router.get('/:examId/answers', authenticateToken, (req, res) => {
  const enrollment = findOne('exam_enrollments',
    en => en.exam_id === parseInt(req.params.examId) && en.student_id === req.user.id);

  if (!enrollment) {
    return res.status(400).json({ error: '未参加此考试' });
  }

  const answers = findMany('answers', a => a.enrollment_id === enrollment.id)
    .map(a => {
      const question = findOne('questions', q => q.id === a.question_id);
      return {
        ...a,
        question_type: question?.type,
        question_score: question?.score
      };
    });

  res.json({ answers, enrollment });
});

router.post('/:examId/submit', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '只有学生可以提交考试' });
  }

  const enrollment = findOne('exam_enrollments',
    en => en.exam_id === parseInt(req.params.examId) && en.student_id === req.user.id);

  if (!enrollment) {
    return res.status(400).json({ error: '未参加此考试' });
  }

  if (enrollment.status === 'submitted') {
    return res.status(400).json({ error: '考试已提交' });
  }

  const exam = getById('exams', req.params.examId);
  const questions = findMany('questions', q => q.exam_id === parseInt(req.params.examId));
  const answers = findMany('answers', a => a.enrollment_id === enrollment.id);

  let totalScore = 0;
  const answerMap = new Map(answers.map(a => [a.question_id, a]));

  questions.forEach(question => {
    const userAnswer = answerMap.get(question.id);
    let score = 0;

    if (userAnswer && userAnswer.answer) {
      if (question.type === 'single' || question.type === 'judge') {
        if (userAnswer.answer === question.answer) {
          score = question.score;
        }
      } else if (question.type === 'multiple') {
        const correctAnswers = JSON.parse(question.answer || '[]');
        const userAnswers = JSON.parse(userAnswer.answer || '[]');
        
        if (correctAnswers.length === userAnswers.length &&
            correctAnswers.every(a => userAnswers.includes(a))) {
          score = question.score;
        }
      }

      if (score > 0) {
        const ans = findOne('answers', a => a.enrollment_id === enrollment.id && a.question_id === question.id);
        if (ans) {
          update('answers', ans.id, { score });
        }
      }
    }

    totalScore += score;
  });

  update('exam_enrollments', enrollment.id, {
    status: 'submitted',
    submit_time: new Date().toISOString(),
    score: totalScore
  });

  insert('behavior_logs', {
    enrollment_id: enrollment.id,
    exam_id: parseInt(req.params.examId),
    student_id: req.user.id,
    action_type: 'submit_exam',
    action_data: JSON.stringify({ time: new Date().toISOString(), score: totalScore })
  });

  res.json({ message: '考试提交成功', score: totalScore });
});

router.post('/:examId/cheating-event', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '权限不足' });
  }

  const { event_type, description, severity } = req.body;

  const enrollment = findOne('exam_enrollments',
    en => en.exam_id === parseInt(req.params.examId) && en.student_id === req.user.id);

  if (!enrollment) {
    return res.status(400).json({ error: '未参加此考试' });
  }

  insert('cheating_events', {
    enrollment_id: enrollment.id,
    exam_id: parseInt(req.params.examId),
    student_id: req.user.id,
    event_type,
    description: description || '',
    severity: severity || 'warning',
    timestamp: new Date().toISOString()
  });

  update('exam_enrollments', enrollment.id, {
    cheating_score: (enrollment.cheating_score || 0) + 1
  });

  const io = req.app.get('io');
  if (io) {
    const exam = getById('exams', req.params.examId);
    if (exam) {
      io.to(`exam_${req.params.examId}_teacher`).emit('cheating_alert', {
        examId: req.params.examId,
        studentId: req.user.id,
        studentName: req.user.name,
        eventType: event_type,
        description,
        severity: severity || 'warning',
        timestamp: new Date().toISOString()
      });
    }
  }

  res.json({ message: '事件已记录' });
});

router.post('/:examId/behavior-log', authenticateToken, (req, res) => {
  const { action_type, action_data } = req.body;

  const enrollment = findOne('exam_enrollments',
    en => en.exam_id === parseInt(req.params.examId) && en.student_id === req.user.id);

  if (!enrollment) {
    return res.status(400).json({ error: '未参加此考试' });
  }

  insert('behavior_logs', {
    enrollment_id: enrollment.id,
    exam_id: parseInt(req.params.examId),
    student_id: req.user.id,
    action_type,
    action_data: action_data ? JSON.stringify(action_data) : null,
    timestamp: new Date().toISOString()
  });

  res.json({ message: '行为已记录' });
});

router.get('/:examId/enrollments', authenticateToken, requireRole('teacher'), (req, res) => {
  const exam = getById('exams', req.params.examId);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此考试' });
  }

  const enrollments = findMany('exam_enrollments', en => en.exam_id === parseInt(req.params.examId))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(en => {
      const student = findOne('users', u => u.id === en.student_id);
      return {
        ...en,
        student_name: student?.name,
        student_username: student?.username
      };
    });

  res.json({ enrollments });
});

router.get('/:examId/enrollment/:enrollmentId/answers', authenticateToken, requireRole('teacher'), (req, res) => {
  const exam = getById('exams', req.params.examId);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此考试' });
  }

  const enrollment = getById('exam_enrollments', req.params.enrollmentId);
  if (!enrollment) {
    return res.status(404).json({ error: '考试记录不存在' });
  }

  const student = findOne('users', u => u.id === enrollment.student_id);

  const answers = findMany('answers', a => a.enrollment_id === parseInt(req.params.enrollmentId))
    .map(a => {
      const question = findOne('questions', q => q.id === a.question_id);
      const answerCopy = {
        ...a,
        question_type: question?.type,
        question_content: question?.content,
        question_score: question?.score,
        correct_answer: question?.answer
      };
      
      if (question?.options) {
        answerCopy.question_options = JSON.parse(question.options);
      } else {
        answerCopy.question_options = null;
      }

      if (question?.type === 'multiple' && question?.answer) {
        answerCopy.correct_answer = JSON.parse(question.answer);
      }
      
      if (question?.type === 'multiple' && a.answer) {
        answerCopy.answer = JSON.parse(a.answer);
      }
      
      return answerCopy;
    })
    .sort((a, b) => {
      const qA = findOne('questions', q => q.id === a.question_id);
      const qB = findOne('questions', q => q.id === b.question_id);
      return (qA?.order_index || 0) - (qB?.order_index || 0) || a.question_id - b.question_id;
    });

  const enrollmentWithName = {
    ...enrollment,
    student_name: student?.name
  };

  const cheatingEvents = findMany('cheating_events', ce => ce.enrollment_id === parseInt(req.params.enrollmentId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const behaviorLogs = findMany('behavior_logs', bl => bl.enrollment_id === parseInt(req.params.enrollmentId))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  res.json({ answers, enrollment: enrollmentWithName, cheatingEvents, behaviorLogs });
});

router.post('/:examId/enrollment/:enrollmentId/grade/:answerId', authenticateToken, requireRole('teacher'), (req, res) => {
  const { score, teacher_comment } = req.body;

  const exam = getById('exams', req.params.examId);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权批改此考试' });
  }

  const answer = getById('answers', req.params.answerId);
  
  if (!answer) {
    return res.status(404).json({ error: '答案不存在' });
  }

  update('answers', req.params.answerId, {
    score,
    teacher_comment: teacher_comment || ''
  });

  const allAnswers = findMany('answers', a => a.enrollment_id === parseInt(req.params.enrollmentId));
  const totalScore = allAnswers.reduce((sum, a) => sum + (parseFloat(a.score) || 0), 0);

  update('exam_enrollments', req.params.enrollmentId, { score: totalScore });

  res.json({ message: '评分成功', totalScore });
});

router.get('/:examId/cheating-events', authenticateToken, requireRole('teacher'), (req, res) => {
  const exam = getById('exams', req.params.examId);
  
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此考试' });
  }

  const events = findMany('cheating_events', ce => ce.exam_id === parseInt(req.params.examId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map(ce => {
      const student = findOne('users', u => u.id === ce.student_id);
      return {
        ...ce,
        student_name: student?.name
      };
    });

  res.json({ events });
});

module.exports = router;
