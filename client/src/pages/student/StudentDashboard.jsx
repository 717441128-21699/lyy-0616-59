import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { examAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function StudentDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    try {
      const response = await examAPI.getExams();
      setExams(response.data.exams);
    } catch (err) {
      console.error('加载考试列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  const getStatusText = (exam) => {
    const now = new Date();
    const start = new Date(exam.start_time);
    const end = new Date(exam.end_time);

    if (now < start) return { text: '未开始', color: 'bg-gray-100 text-gray-600' };
    if (now > end) return { text: '已结束', color: 'bg-red-100 text-red-600' };
    return { text: '进行中', color: 'bg-green-100 text-green-600' };
  };

  const getEnrollmentStatusText = (status) => {
    switch (status) {
      case 'submitted': return '已提交';
      case 'in_progress': return '进行中';
      default: return '未参加';
    }
  };

  const canEnterExam = (exam) => {
    const now = new Date();
    const start = new Date(exam.start_time);
    const end = new Date(exam.end_time);
    return now >= start && now <= end && exam.enrollment_status !== 'submitted';
  };

  const handleEnterExam = (examId) => {
    navigate(`/student/exam/${examId}`);
  };

  const handleViewReport = (examId) => {
    navigate(`/student/report/${examId}`);
  };

  if (loading) {
    return (
      <Layout title="我的考试">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="我的考试">
      <div className="mb-6">
        <p className="text-gray-600">欢迎回来，{user?.name}！以下是您可以参加的考试。</p>
      </div>

      {exams.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <div className="text-6xl mb-4">📭</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">暂无考试</h3>
          <p className="text-gray-500">目前没有可参加的考试</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => {
          const status = getStatusText(exam);
          const canEnter = canEnterExam(exam);
          
          return (
            <div
              key={exam.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                  {status.text}
                </span>
                <span className="text-sm text-gray-500">{exam.question_count} 题</span>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{exam.title}</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                {exam.description || '暂无描述'}
              </p>

              <div className="space-y-2 text-sm text-gray-600 mb-6">
                <div className="flex justify-between flex">
                  <span>考试时长:</span>
                  <span className="font-medium">{exam.duration} 分钟</span>
                </div>
                <div className="flex justify-between">
                  <span>开始时间:</span>
                  <span className="font-medium">{formatDate(exam.start_time)}</span>
                </div>
                <div className="flex justify-between">
                  <span>状态:</span>
                  <span className="font-medium">{getEnrollmentStatusText(exam.enrollment_status)}</span>
                </div>
              </div>

              {canEnter ? (
                <button
                  onClick={() => handleEnterExam(exam.id)}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-4 rounded-xl transition"
                >
                  {exam.enrollment_status === 'in_progress' ? '继续考试' : '开始考试'}
                </button>
              ) : exam.enrollment_status === 'submitted' ? (
                <button
                  onClick={() => handleViewReport(exam.id)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2.5 px-4 rounded-xl transition"
                >
                  查看报告
                </button>
              ) : (
                <button
                  disabled
                  className="w-full bg-gray-100 text-gray-400 font-medium py-2.5 px-4 rounded-xl cursor-not-allowed"
                >
                  {status.text === '未开始' ? '尚未开始' : '已结束'}
                </button>
              )}
            </div>
          );
        })}
        </div>
      )}
    </Layout>
  );
}
