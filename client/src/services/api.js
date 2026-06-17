import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  getStudents: () => api.get('/auth/students'),
};

export const examAPI = {
  getExams: () => api.get('/exams'),
  getExam: (id) => api.get(`/exams/${id}`),
  createExam: (data) => api.post('/exams', data),
  updateExam: (id, data) => api.put(`/exams/${id}`, data),
  deleteExam: (id) => api.delete(`/exams/${id}`),
  addQuestion: (examId, data) => api.post(`/exams/${examId}/questions`, data),
  updateQuestion: (examId, questionId, data) => api.put(`/exams/${examId}/questions/${questionId}`, data),
  deleteQuestion: (examId, questionId) => api.delete(`/exams/${examId}/questions/${questionId}`),
};

export const examActionAPI = {
  enroll: (examId) => api.post(`/exam/${examId}/enroll`),
  submitAnswer: (examId, questionId, answer) => api.post(`/exam/${examId}/answer/${questionId}`, { answer }),
  getAnswers: (examId) => api.get(`/exam/${examId}/answers`),
  submitExam: (examId) => api.post(`/exam/${examId}/submit`),
  reportCheating: (examId, event_type, description, severity) =>
    api.post(`/exam/${examId}/cheating-event`, { event_type, description, severity }),
  logBehavior: (examId, action_type, action_data) =>
    api.post(`/exam/${examId}/behavior-log`, { action_type, action_data }),
  getEnrollments: (examId) => api.get(`/exam/${examId}/enrollments`),
  getEnrollmentAnswers: (examId, enrollmentId) => api.get(`/exam/${examId}/enrollment/${enrollmentId}/answers`),
  gradeAnswer: (examId, enrollmentId, answerId, score, teacher_comment) =>
    api.post(`/exam/${examId}/enrollment/${enrollmentId}/grade/${answerId}`, { score, teacher_comment }),
  getCheatingEvents: (examId) => api.get(`/exam/${examId}/cheating-events`),
};

export const reportAPI = {
  getStudentReport: (examId, studentId) => api.get(`/reports/exam/${examId}/student/${studentId}`),
  getExamSummary: (examId) => api.get(`/reports/exam/${examId}/summary`),
};

export const recordingAPI = {
  uploadRecording: (formData, onProgress) => 
    api.post('/recordings/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    }),
  getEnrollmentRecordings: (enrollmentId) => api.get(`/recordings/enrollment/${enrollmentId}`),
  getRecordingPlayUrl: (recordingId) => {
    const token = localStorage.getItem('token') || '';
    return `/api/recordings/${recordingId}/play?token=${encodeURIComponent(token)}`;
  },
};

export default api;
