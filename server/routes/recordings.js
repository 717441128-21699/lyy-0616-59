const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { findOne, findMany, insert, getById } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const recordingsDir = path.join(__dirname, '..', 'data', 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recordingsDir);
  },
  filename: (req, file, cb) => {
    const { examId, enrollmentId, type } = req.body;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.webm';
    const filename = `exam${examId}_enroll${enrollmentId}_${type}_${timestamp}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

router.post('/upload', authenticateToken, upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传视频文件' });
    }

    const { examId, enrollmentId, type, duration, startTime } = req.body;

    if (!examId || !enrollmentId || !type) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const enrollment = getById('exam_enrollments', enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: '考试记录不存在' });
    }

    if (enrollment.student_id !== req.user.id && req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权上传此录像' });
    }

    const recording = insert('recordings', {
      exam_id: parseInt(examId),
      enrollment_id: parseInt(enrollmentId),
      student_id: enrollment.student_id,
      type: type,
      file_path: req.file.filename,
      file_size: req.file.size,
      duration: parseFloat(duration) || 0,
      start_time: startTime || new Date().toISOString(),
      end_time: new Date().toISOString()
    });

    res.json({ id: recording.id, message: '录像上传成功', recording });
  } catch (err) {
    console.error('录像上传失败:', err);
    res.status(500).json({ error: '录像上传失败: ' + err.message });
  }
});

router.get('/enrollment/:enrollmentId', authenticateToken, (req, res) => {
  const enrollment = getById('exam_enrollments', req.params.enrollmentId);
  
  if (!enrollment) {
    return res.status(404).json({ error: '考试记录不存在' });
  }

  const exam = getById('exams', enrollment.exam_id);

  if (req.user.role === 'student' && enrollment.student_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此录像' });
  }

  if (req.user.role === 'teacher' && exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此录像' });
  }

  const recordings = findMany('recordings', r => r.enrollment_id === parseInt(req.params.enrollmentId))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  res.json({ recordings });
});

router.get('/:recordingId/play', authenticateToken, (req, res) => {
  const recording = getById('recordings', req.params.recordingId);
  
  if (!recording) {
    return res.status(404).json({ error: '录像不存在' });
  }

  const enrollment = getById('exam_enrollments', recording.enrollment_id);
  const exam = getById('exams', recording.exam_id);

  if (req.user.role === 'student' && enrollment.student_id !== req.user.id) {
    return res.status(403).json({ error: '无权播放此录像' });
  }

  if (req.user.role === 'teacher' && exam.teacher_id !== req.user.id) {
    return res.status(403).json({ error: '无权播放此录像' });
  }

  const filePath = path.join(recordingsDir, recording.file_path);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '录像文件不存在' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/webm'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/webm'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
