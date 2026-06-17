const { findOne, insert, update, findMany } = require('../database');

const activeStudents = new Map();
const activeTeachers = new Map();

function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('新连接:', socket.id);

    socket.on('join_as_student', (data) => {
      const { studentId, examId, studentName } = data;
      
      const key = `${examId}_${studentId}`;
      activeStudents.set(key, {
        socketId: socket.id,
        studentId,
        examId,
        studentName,
        joinedAt: new Date().toISOString()
      });

      socket.join(`exam_${examId}_student`);
      socket.join(`student_${studentId}`);
      
      const teacherRoom = `exam_${examId}_teacher`;
      io.to(teacherRoom).emit('student_joined', {
        studentId,
        studentName,
        examId,
        joinedAt: new Date().toISOString()
      });

      console.log(`学生 ${studentName} 加入考试 ${examId}`);
    });

    socket.on('join_as_teacher', (data) => {
      const { teacherId, examId } = data;
      
      activeTeachers.set(`${examId}_${teacherId}`, {
        socketId: socket.id,
        teacherId,
        examId
      });

      socket.join(`exam_${examId}_teacher`);
      socket.join(`teacher_${teacherId}`);

      const studentsInExam = [];
      activeStudents.forEach((student, key) => {
        if (student.examId === examId) {
          studentsInExam.push({
            studentId: student.studentId,
            studentName: student.studentName,
            joinedAt: student.joinedAt
          });
        }
      });

      socket.emit('active_students_list', studentsInExam);
      console.log(`教师 ${teacherId} 加入监考 ${examId}`);
    });

    socket.on('camera_frame', (data) => {
      const { examId, studentId, frameData, studentName } = data;
      
      const teacherRoom = `exam_${examId}_teacher`;
      io.to(teacherRoom).emit('student_camera_frame', {
        studentId,
        studentName,
        examId,
        frameData,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('screen_frame', (data) => {
      const { examId, studentId, frameData } = data;
      
      const teacherRoom = `exam_${examId}_teacher`;
      io.to(teacherRoom).emit('student_screen_frame', {
        studentId,
        examId,
        frameData,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('cheating_alert', (data) => {
      const { examId, studentId, eventType, description, severity, studentName } = data;

      try {
        const enrollment = findOne('exam_enrollments',
          en => en.exam_id === parseInt(examId) && en.student_id === parseInt(studentId));

        if (enrollment) {
          insert('cheating_events', {
            enrollment_id: enrollment.id,
            exam_id: parseInt(examId),
            student_id: parseInt(studentId),
            event_type: eventType,
            description: description || '',
            severity: severity || 'warning',
            timestamp: new Date().toISOString()
          });

          update('exam_enrollments', enrollment.id, {
            cheating_score: (enrollment.cheating_score || 0) + 1
          });
        }
      } catch (err) {
        console.error('保存作弊事件失败:', err);
      }

      const teacherRoom = `exam_${examId}_teacher`;
      io.to(teacherRoom).emit('cheating_alert', {
        examId,
        studentId,
        studentName,
        eventType,
        description,
        severity: severity || 'warning',
        timestamp: new Date().toISOString()
      });
    });

    socket.on('student_status_update', (data) => {
      const { examId, studentId, status, studentName } = data;
      
      const teacherRoom = `exam_${examId}_teacher`;
      io.to(teacherRoom).emit('student_status_update', {
        studentId,
        studentName,
        examId,
        status,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('teacher_request_view', (data) => {
      const { examId, studentId, teacherId } = data;
      
      const studentKey = `${examId}_${studentId}`;
      const student = activeStudents.get(studentKey);
      
      if (student) {
        io.to(student.socketId).emit('teacher_watching', {
          teacherId,
          examId
        });
      }
    });

    socket.on('send_message_to_student', (data) => {
      const { examId, studentId, message, teacherId } = data;
      
      const studentKey = `${examId}_${studentId}`;
      const student = activeStudents.get(studentKey);
      
      if (student) {
        io.to(student.socketId).emit('teacher_message', {
          message,
          teacherId,
          examId,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('disconnect', () => {
      let removedStudent = null;
      let removedKey = null;
      
      activeStudents.forEach((student, key) => {
        if (student.socketId === socket.id) {
          removedStudent = student;
          removedKey = key;
        }
      });

      if (removedStudent && removedKey) {
        activeStudents.delete(removedKey);
        
        const teacherRoom = `exam_${removedStudent.examId}_teacher`;
        io.to(teacherRoom).emit('student_left', {
          studentId: removedStudent.studentId,
          studentName: removedStudent.studentName,
          examId: removedStudent.examId
        });
        console.log(`学生 ${removedStudent.studentName} 断开连接`);
      }

      let removedTeacherKey = null;
      activeTeachers.forEach((teacher, key) => {
        if (teacher.socketId === socket.id) {
          removedTeacherKey = key;
        }
      });
      if (removedTeacherKey) {
        activeTeachers.delete(removedTeacherKey);
      }

      console.log('断开连接:', socket.id);
    });
  });
}

function getActiveStudents(examId) {
  const students = [];
  activeStudents.forEach((student, key) => {
    if (!examId || student.examId === examId) {
      students.push(student);
    }
  });
  return students;
}

module.exports = { setupSocket, getActiveStudents };
