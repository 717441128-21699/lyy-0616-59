import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { examAPI } from '../../services/api';

export default function TeacherDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  const getStatusConfig = (status) => {
    const configs = {
      draft: { text: '草稿', color: 'bg-gray-100 text-gray-600' },
      published: { text: '已发布', color: 'bg-green-100 text-green-600' },
      closed: { text: '已结束', color: 'bg-red-100 text-red-600' }
    };
    return configs[status] || { text: status, color: 'bg-gray-100 text-gray-600' };
  };

  const handleDelete = async (examId) => {
    if (!confirm('确定要删除这个考试吗？此操作不可撤销。')) return;
    
    try {
      await examAPI.deleteExam(examId);
      setExams(exams.filter(e => e.id !== examId));
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePublish = async (examId, publish) => {
    try {
      await examAPI.updateExam(examId, { status: publish ? 'published' : 'draft' });
      loadExams();
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return (
      <Layout title="考试管理">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="考试管理">
      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-600">共 {exams.length} 场考试</p>
        <button
          onClick={() => navigate('/teacher/exam/new')}
          className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-medium transition"
        >
          <span className="text-lg">+</span>
          创建考试
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">暂无考试</h3>
          <p className="text-gray-500 mb-6">点击上方按钮创建您的第一场考试</p>
          <button
            onClick={() => navigate('/teacher/exam/new')}
            className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-2.5 rounded-xl font-medium transition"
          >
            创建考试
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => {
            const statusConfig = getStatusConfig(exam.status);
            
            return (
              <div
                key={exam.id}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                    {statusConfig.text}
                  </span>
                  <span className="text-sm text-gray-500">{exam.question_count} 题</span>
                </div>

                <h3 className="text-lg font-semibold text-gray-800 mb-2">{exam.title}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {exam.description || '暂无描述'}
                </p>

                <div className="space-y-2 text-sm text-gray-600 mb-6">
                  <div className="flex justify-between">
                    <span>考试时长:</span>
                    <span className="font-medium">{exam.duration} 分钟</span>
                  </div>
                  <div className="flex justify-between">
                    <span>开始时间:</span>
                    <span className="font-medium">{formatDate(exam.start_time)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate(`/teacher/exam/${exam.id}/edit`)}
                    className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => navigate(`/teacher/exam/${exam.id}/proctor`)}
                    className="py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl text-sm font-medium transition"
                  >
                    监考
                  </button>
                  <button
                    onClick={() => navigate(`/teacher/exam/${exam.id}/grading`)}
                    className="py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl text-sm font-medium transition"
                  >
                    批改
                  </button>
                  <button
                    onClick={() => navigate(`/teacher/exam/${exam.id}/report`)}
                    className="py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl text-sm font-medium transition"
                  >
                    报告
                  </button>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                  {exam.status === 'draft' ? (
                    <button
                      onClick={() => handlePublish(exam.id, true)}
                      className="flex-1 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition"
                    >
                      发布考试
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePublish(exam.id, false)}
                      className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition"
                    >
                      取消发布
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(exam.id)}
                    className="flex-1 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
