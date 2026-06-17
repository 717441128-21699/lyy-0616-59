import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { reportAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function StudentReport() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [examId, user?.id]);

  const loadReport = async () => {
    try {
      const response = await reportAPI.getStudentReport(examId, user.id);
      setReport(response.data.report);
    } catch (err) {
      console.error('加载报告失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="考试报告">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  if (!report) {
    return (
      <Layout title="考试报告">
        <div className="text-center py-12">
          <p className="text-gray-500">暂无报告数据</p>
          <button
            onClick={() => navigate('/student')}
            className="mt-4 text-primary-500 hover:text-primary-600"
          >
            返回考试列表
          </button>
        </div>
      </Layout>
    );
  }

  const warningLevelColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-green-100 text-green-700 border-green-200'
  };

  const warningLevelText = {
    high: '高风险',
    medium: '中风险',
    low: '低风险'
  };

  return (
    <Layout title="考试报告">
      <div className="max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/student')}
          className="text-gray-500 hover:text-gray-700 flex items-center gap-2"
        >
          ← 返回考试列表
        </button>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{report.examInfo.title}</h2>
              <p className="text-gray-500 mt-1">{report.studentInfo.name}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-primary-600">
                {report.scoreAnalysis.totalScore}
                <span className="text-xl text-gray-400">/{report.scoreAnalysis.maxScore}</span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                得分率 {report.scoreAnalysis.percentage}%
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-gray-500 text-sm mb-2">答题情况</h3>
            <div className="text-2xl font-bold text-gray-800">
              {report.scoreAnalysis.answeredCount}/{report.scoreAnalysis.totalQuestions}
            </div>
            <p className="text-sm text-gray-500 mt-1">题已作答</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-gray-500 text-sm mb-2">答题用时</h3>
            <div className="text-2xl font-bold text-gray-800">
              {report.timeAnalysis.totalAnswerTimeFormatted}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              用时 {report.timeAnalysis.timeUsagePercent}%
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-gray-500 text-sm mb-2">作弊风险</h3>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${warningLevelColors[report.cheatingAnalysis.warningLevel]}`}>
              {warningLevelText[report.cheatingAnalysis.warningLevel]}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              异常事件 {report.cheatingAnalysis.totalEvents} 次
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <h3 className="text-gray-500 text-sm mb-1">窗口切换总次数</h3>
            <div className="text-2xl font-bold text-amber-600">
              {report.cheatingAnalysis.windowSwitchTotalCount || 0}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <h3 className="text-gray-500 text-sm mb-1">窗口切换超限</h3>
            <div className="text-2xl font-bold text-amber-600">
              {report.cheatingAnalysis.eventBreakdown?.windowSwitchExceeded || 0}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <h3 className="text-gray-500 text-sm mb-1">多人脸检测</h3>
            <div className="text-2xl font-bold text-red-600">
              {report.cheatingAnalysis.eventBreakdown?.multipleFaces || 0}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <h3 className="text-gray-500 text-sm mb-1">长时间离开</h3>
            <div className="text-2xl font-bold text-orange-600">
              {report.cheatingAnalysis.eventBreakdown?.noFaceDetected || 0}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📝 答题详情</h3>
          <div className="space-y-3">
            {report.behaviorAnalysis.questionAnalysis.map((q, index) => (
              <div
                key={q.questionId}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-sm font-medium text-gray-600">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{getQuestionTypeLabel(q.type)}</p>
                    <p className="text-xs text-gray-500">{q.score} 分</p>
                  </div>
                </div>
                <div className="text-right">
                  {q.isCorrect === true ? (
                    <span className="text-green-500 font-medium">✓ 正确</span>
                  ) : q.isCorrect === false ? (
                    <span className="text-red-500 font-medium">✗ 错误</span>
                  ) : q.hasAnswer ? (
                    <span className="text-gray-500">待批改</span>
                  ) : (
                    <span className="text-gray-400">未作答</span>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    得分: {q.userScore}/{q.score}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {report.cheatingAnalysis.totalAlerts > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">⚠️ 异常事件明细</h3>
            <div className="space-y-4">
              {Object.entries(report.cheatingAnalysis.eventsByType || {}).map(([type, events]) => {
                if (events.length === 0) return null;
                return (
                  <div key={type} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{getEventTypeIcon(type)}</span>
                      <span className="font-medium text-gray-800">{getEventTypeLabel(type)}</span>
                      <span className="text-sm text-gray-500">· 共 {events.length} 次</span>
                    </div>
                    <div className="space-y-2">
                      {events.map((event, idx) => (
                        <div key={event.id || idx} className="bg-white rounded-lg p-3 flex items-start gap-3">
                          <span className="text-red-500 mt-0.5">⚠️</span>
                          <div className="flex-1">
                            <p className="text-sm text-gray-800">{event.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(event.timestamp).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 行为统计</h3>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(report.behaviorAnalysis.actionTypes).map(([type, count]) => (
              <div key={type} className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-800">{count}</div>
                <p className="text-xs text-gray-500 mt-1">{getActionTypeLabel(type)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function getQuestionTypeLabel(type) {
  const labels = {
    single: '单选题',
    multiple: '多选题',
    judge: '判断题',
    short_answer: '简答题',
    programming: '编程题'
  };
  return labels[type] || type;
}

function getEventTypeLabel(type) {
  const labels = {
    window_switch_exceeded: '窗口切换超限',
    multiple_faces: '多人脸检测',
    no_face_detected: '长时间离开',
    screen_share_stopped: '屏幕共享停止'
  };
  return labels[type] || type;
}

function getEventTypeIcon(type) {
  const icons = {
    window_switch_exceeded: '🔀',
    multiple_faces: '👥',
    no_face_detected: '🚶',
    screen_share_stopped: '📵'
  };
  return icons[type] || '⚠️';
}

function getActionTypeLabel(type) {
  const labels = {
    start_exam: '开始考试',
    answer_question: '答题',
    submit_exam: '提交考试'
  };
  return labels[type] || type;
}
