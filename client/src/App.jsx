import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import StudentDashboard from './pages/student/StudentDashboard';
import ExamRoom from './pages/student/ExamRoom';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import ExamEditor from './pages/teacher/ExamEditor';
import ProctorRoom from './pages/teacher/ProctorRoom';
import GradingPage from './pages/teacher/GradingPage';
import ReportPage from './pages/teacher/ReportPage';
import StudentReport from './pages/student/StudentReport';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl text-gray-600">加载中...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />} />
      
      <Route path="/student" element={user?.role === 'student' ? <StudentDashboard /> : <Navigate to="/login" replace />} />
      <Route path="/student/exam/:examId" element={user?.role === 'student' ? <ExamRoom /> : <Navigate to="/login" replace />} />
      <Route path="/student/report/:examId" element={user?.role === 'student' ? <StudentReport /> : <Navigate to="/login" replace />} />
      
      <Route path="/teacher" element={user?.role === 'teacher' ? <TeacherDashboard /> : <Navigate to="/login" replace />} />
      <Route path="/teacher/exam/new" element={user?.role === 'teacher' ? <ExamEditor /> : <Navigate to="/login" replace />} />
      <Route path="/teacher/exam/:examId/edit" element={user?.role === 'teacher' ? <ExamEditor /> : <Navigate to="/login" replace />} />
      <Route path="/teacher/exam/:examId/proctor" element={user?.role === 'teacher' ? <ProctorRoom /> : <Navigate to="/login" replace />} />
      <Route path="/teacher/exam/:examId/grading" element={user?.role === 'teacher' ? <GradingPage /> : <Navigate to="/login" replace />} />
      <Route path="/teacher/exam/:examId/report" element={user?.role === 'teacher' ? <ReportPage /> : <Navigate to="/login" replace />} />
      
      <Route path="*" element={<Navigate to={user ? (user.role === 'teacher' ? '/teacher' : '/student') : '/login'} replace />} />
    </Routes>
  );
}

export default App;
