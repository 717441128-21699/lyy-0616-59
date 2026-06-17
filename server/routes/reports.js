const express = require('express');
const { findOne, findMany, getById } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/exam/:examId/student/:studentId', authenticateToken, (req, res) => {
  const { examId, studentId } = req.params;

  const exam = getById('exams', examId);
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (req.user.role === 'student' && req.user.id !== parseInt(studentId)) {
    return res.status(403).json({ error: '无权查看此报告' });
  }

  if (req.user.role === 'teacher' && exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此报告' });
  }

  const enrollment = findOne('exam_enrollments',
    en => en.exam_id === parseInt(examId) && en.student_id === parseInt(studentId));

  if (!enrollment) {
    return res.status(404).json({ error: '未找到考试记录' });
  }

  const student = findOne('users', u => u.id === parseInt(studentId));
  const questions = findMany('questions', q => q.exam_id === parseInt(examId))
    .sort((a, b) => a.order_index - b.order_index);
  const answers = findMany('answers', a => a.enrollment_id === enrollment.id);
  const cheatingEvents = findMany('cheating_events', ce => ce.enrollment_id === enrollment.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const behaviorLogs = findMany('behavior_logs', bl => bl.enrollment_id === enrollment.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const answerMap = new Map(answers.map(a => [a.question_id, a]));

  const questionAnalysis = questions.map(q => {
    const userAnswer = answerMap.get(q.id);
    let isCorrect = null;

    if (userAnswer && userAnswer.answer != null && userAnswer.answer !== '') {
      if (q.type === 'single' || q.type === 'judge') {
        isCorrect = userAnswer.answer === q.answer;
      } else if (q.type === 'multiple') {
        const correct = JSON.parse(q.answer || '[]');
        const userAns = JSON.parse(userAnswer.answer || '[]');
        isCorrect = correct.length === userAns.length && 
                    correct.every(a => userAns.includes(a));
      }
    }

    return {
      questionId: q.id,
      type: q.type,
      score: q.score,
      userScore: userAnswer ? parseFloat(userAnswer.score) || 0 : 0,
      isCorrect,
      hasAnswer: !!(userAnswer && userAnswer.answer)
    };
  });

  const totalScore = questionAnalysis.reduce((sum, q) => sum + (q.userScore || 0), 0);
  const maxScore = questionAnalysis.reduce((sum, q) => sum + q.score, 0);
  const correctCount = questionAnalysis.filter(q => q.isCorrect === true).length;
  const answeredCount = questionAnalysis.filter(q => q.hasAnswer).length;

  const answerActions = behaviorLogs.filter(l => l.action_type === 'answer_question');
  const firstAnswerTime = answerActions.length > 0 ? new Date(answerActions[0].timestamp) : null;
  const lastAnswerTime = answerActions.length > 0 ? new Date(answerActions[answerActions.length - 1].timestamp) : null;
  const totalAnswerTime = firstAnswerTime && lastAnswerTime 
    ? Math.round((lastAnswerTime - firstAnswerTime) / 1000) 
    : 0;

  const eventTypeCounts = {};
  cheatingEvents.forEach(event => {
    eventTypeCounts[event.event_type] = (eventTypeCounts[event.event_type] || 0) + 1;
  });

  const windowSwitchExceedCount = eventTypeCounts['window_switch_exceeded'] || 0;
  const multipleFaceCount = eventTypeCounts['multiple_faces'] || 0;
  const noFaceCount = eventTypeCounts['no_face_detected'] || 0;
  const screenShareStopCount = eventTypeCounts['screen_share_stopped'] || 0;
  const alertCount = windowSwitchExceedCount + multipleFaceCount + noFaceCount + screenShareStopCount;

  const windowSwitchLogs = behaviorLogs.filter(l => l.action_type === 'window_switch');
  const windowSwitchTotalCount = windowSwitchLogs.length > 0 
    ? Math.max(...windowSwitchLogs.map(l => {
        try {
          const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
          return parseInt(d?.count) || 0;
        } catch (e) { return 0; }
      }))
    : 0;

  const cheatingScore = (enrollment.cheating_score != null) 
    ? enrollment.cheating_score 
    : alertCount;
  
  const warningLevel = cheatingScore > 10 ? 'high' 
    : cheatingScore > 5 ? 'medium' 
    : cheatingScore > 0 ? 'low'
    : 'none';

  const report = {
    examInfo: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      start_time: exam.start_time,
      end_time: exam.end_time
    },
    studentInfo: {
      id: enrollment.student_id,
      name: student?.name,
      username: student?.username
    },
    enrollmentInfo: {
      status: enrollment.status,
      start_time: enrollment.start_time,
      submit_time: enrollment.submit_time,
      score: enrollment.score,
      cheating_score: cheatingScore
    },
    scoreAnalysis: {
      totalScore,
      maxScore,
      percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
      correctCount,
      answeredCount,
      totalQuestions: questions.length
    },
    timeAnalysis: {
      totalAnswerTime,
      totalAnswerTimeFormatted: formatDuration(totalAnswerTime),
      examDuration: exam.duration * 60,
      timeUsagePercent: exam.duration > 0 ? Math.min(100, Math.round((totalAnswerTime / (exam.duration * 60)) * 100)) : 0
    },
    cheatingAnalysis: {
      totalAlerts: alertCount,
      totalEvents: cheatingEvents.length,
      cheatingScore,
      warningLevel,
      windowSwitchTotalCount,
      eventBreakdown: {
        windowSwitchExceeded: windowSwitchExceedCount,
        multipleFaces: multipleFaceCount,
        noFaceDetected: noFaceCount,
        screenShareStopped: screenShareStopCount,
        other: Math.max(0, cheatingEvents.length - alertCount)
      },
      events: cheatingEvents
    },
    behaviorAnalysis: {
      totalActions: behaviorLogs.length,
      actionTypes: countByType(behaviorLogs),
      questionAnalysis,
      logs: behaviorLogs.slice(0, 100)
    }
  };

  res.json({ report });
});

router.get('/exam/:examId/summary', authenticateToken, requireRole('teacher'), (req, res) => {
  const { examId } = req.params;

  const exam = getById('exams', examId);
  if (!exam) {
    return res.status(404).json({ error: '考试不存在' });
  }

  if (exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此报告' });
  }

  const enrollments = findMany('exam_enrollments', en => en.exam_id === parseInt(examId))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map(en => {
      const student = findOne('users', u => u.id === en.student_id);
      return {
        ...en,
        student_name: student?.name
      };
    });

  const submittedCount = enrollments.filter(e => e.status === 'submitted').length;
  const inProgressCount = enrollments.filter(e => e.status === 'in_progress').length;
  const scores = enrollments.filter(e => e.score !== null && e.score !== undefined).map(e => parseFloat(e.score));
  
  const avgScore = scores.length > 0 
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100 
    : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  const highCheatingCount = enrollments.filter(e => (e.cheating_score || 0) > 10).length;
  const mediumCheatingCount = enrollments.filter(e => (e.cheating_score || 0) > 5 && (e.cheating_score || 0) <= 10).length;

  const questions = findMany('questions', q => q.exam_id === parseInt(examId));
  const totalMaxScore = questions.reduce((sum, q) => sum + q.score, 0);

  const scoreDistribution = {
    excellent: 0,
    good: 0,
    medium: 0,
    pass: 0,
    fail: 0
  };

  scores.forEach(score => {
    const percent = totalMaxScore > 0 ? (score / totalMaxScore) * 100 : 0;
    if (percent >= 90) scoreDistribution.excellent++;
    else if (percent >= 80) scoreDistribution.good++;
    else if (percent >= 70) scoreDistribution.medium++;
    else if (percent >= 60) scoreDistribution.pass++;
    else scoreDistribution.fail++;
  });

  const summary = {
    examInfo: {
      id: exam.id,
      title: exam.title,
      totalQuestions: questions.length,
      totalMaxScore
    },
    participation: {
      total: enrollments.length,
      submitted: submittedCount,
      inProgress: inProgressCount,
      pending: enrollments.length - submittedCount - inProgressCount
    },
    scoreStats: {
      average: avgScore,
      max: maxScore,
      min: minScore,
      distribution: scoreDistribution
    },
    cheatingStats: {
      highRisk: highCheatingCount,
      mediumRisk: mediumCheatingCount,
      lowRisk: enrollments.length - highCheatingCount - mediumCheatingCount
    },
    studentScores: enrollments.map(e => ({
      studentId: e.student_id,
      studentName: e.student_name,
      score: e.score,
      cheatingScore: e.cheating_score || 0,
      status: e.status,
      submitTime: e.submit_time
    }))
  };

  res.json({ summary });
});

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时${minutes}分${secs}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

function countByType(logs) {
  const counts = {};
  logs.forEach(log => {
    counts[log.action_type] = (counts[log.action_type] || 0) + 1;
  });
  return counts;
}

module.exports = router;
