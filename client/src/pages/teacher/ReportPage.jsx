import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { reportAPI, examAPI, recordingAPI, examActionAPI } from '../../services/api';

export default function ReportPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  
  const [exam, setExam] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentReport, setStudentReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [activeEventType, setActiveEventType] = useState(null);
  const videoRef = useRef(null);

  const EVENT_TYPE_META = {
    window_switch_exceeded: { label: '窗口切换超限', icon: '🔀', color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700', recordingType: 'screen' },
    multiple_faces: { label: '检测到多人脸', icon: '👥', color: 'bg-red-50 border-red-200', textColor: 'text-red-700', recordingType: 'camera' },
    no_face_detected: { label: '长时间离开', icon: '🚶', color: 'bg-orange-50 border-orange-200', textColor: 'text-orange-700', recordingType: 'camera' },
    screen_share_stopped: { label: '屏幕共享停止', icon: '📵', color: 'bg-purple-50 border-purple-200', textColor: 'text-purple-700', recordingType: 'screen' }
  };

  useEffect(() => {
    loadData();
  }, [examId]);

  const loadData = async () => {
    try {
      const [examRes, summaryRes] = await Promise.all([
        examAPI.getExam(examId),
        reportAPI.getExamSummary(examId)
      ]);
      setExam(examRes.data.exam);
      setSummary(summaryRes.data.summary);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentReport = async (studentId) => {
    setStudentLoading(true);
    try {
      const response = await reportAPI.getStudentReport(examId, studentId);
      setStudentReport(response.data.report);
      setSelectedStudent(studentId);
    } catch (err) {
      console.error('加载学生报告失败:', err);
    } finally {
      setStudentLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayRecordingAt = (event) => {
    const recording = event.recording || (studentReport?.recordingsList && studentReport.recordingsList[0]);
    if (!recording) {
      alert('暂无录像可播放');
      return;
    }
    setSelectedRecording(recording);
    setSeekSeconds(event.relative_seconds || 0);
    setShowRecordingModal(true);
  };

  const handleVideoLoaded = () => {
    if (videoRef.current && seekSeconds > 0) {
      videoRef.current.currentTime = seekSeconds;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMarkResolvedFromReport = async (event) => {
    if (!window.confirm('确认标记此告警为已处理？')) return;
    try {
      await examActionAPI.handleCheatingEvent(examId, event.id, '报告中标记处理', 'resolved');
      if (selectedStudent) {
        await loadStudentReport(selectedStudent);
      }
    } catch (err) {
      console.error('标记失败:', err);
      alert('标记失败');
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

  return (
    <Layout title={`考试报告 - ${exam?.title || ''}`}>
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-6">
          <StatCard
            title="参与人数"
            value={summary?.participation?.total || 0}
            subtitle={`已提交 ${summary?.participation?.submitted || 0} 人`}
            icon="👥"
            color="blue"
          />
          <StatCard
            title="平均分"
            value={summary?.scoreStats?.average || 0}
            subtitle={`满分 ${summary?.examInfo?.totalMaxScore || 0} 分`}
            icon="📊"
            color="green"
          />
          <StatCard
            title="最高分"
            value={summary?.scoreStats?.max || 0}
            subtitle={`最低分 ${summary?.scoreStats?.min || 0}`}
            icon="🏆"
            color="amber"
          />
          <StatCard
            title="高风险考生"
            value={summary?.cheatingStats?.highRisk || 0}
            subtitle={`中风险 ${summary?.cheatingStats?.mediumRisk || 0} 人`}
            icon="⚠️"
            color="red"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📈 分数分布</h3>
            <ScoreDistribution distribution={summary?.scoreStats?.distribution || {}} maxScore={summary?.examInfo?.totalMaxScore || 100} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🎯 作弊风险分布</h3>
            <CheatingDistribution stats={summary?.cheatingStats || {}} total={summary?.participation?.total || 1} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 学生成绩列表</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="pb-3 text-sm font-medium text-gray-500">排名</th>
                  <th className="pb-3 text-sm font-medium text-gray-500">学生</th>
                  <th className="pb-3 text-sm font-medium text-gray-500">得分</th>
                  <th className="pb-3 text-sm font-medium text-gray-500">正确率</th>
                  <th className="pb-3 text-sm font-medium text-gray-500">作弊分</th>
                  <th className="pb-3 text-sm font-medium text-gray-500">状态</th>
                  <th className="pb-3 text-sm font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {summary?.studentScores?.map((student, index) => (
                  <tr key={student.studentId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                        index === 0 ? 'bg-amber-100 text-amber-700' :
                        index === 1 ? 'bg-gray-200 text-gray-600' :
                        index === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="py-3 font-medium text-gray-800">{student.studentName}</td>
                    <td className="py-3">
                      <span className={`font-semibold ${
                        student.score !== null && student.score !== undefined
                          ? student.score >= summary?.examInfo?.totalMaxScore * 0.6
                            ? 'text-green-600'
                            : 'text-red-500'
                          : 'text-gray-400'
                      }`}>
                        {student.score !== null && student.score !== undefined 
                          ? `${student.score}分` 
                          : '-'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600">
                      {student.score !== null && student.score !== undefined && summary?.examInfo?.totalMaxScore
                        ? `${Math.round((student.score / summary.examInfo.totalMaxScore) * 100)}%`
                        : '-'}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        student.cheatingScore > 10 ? 'bg-red-100 text-red-700' :
                        student.cheatingScore > 5 ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {student.cheatingScore}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-gray-500">
                      {student.status === 'submitted' ? '已提交' :
                       student.status === 'in_progress' ? '进行中' : '未开始'}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => loadStudentReport(student.studentId)}
                        className="text-primary-500 hover:text-primary-600 text-sm font-medium"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedStudent && studentReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-8">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  {studentReport.studentInfo.name} - 详细报告
                </h3>
                <p className="text-sm text-gray-500 mt-1">{studentReport.examInfo.title}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedStudent(null);
                  setStudentReport(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {studentReport.scoreAnalysis.totalScore}
                    <span className="text-lg text-blue-400">/{studentReport.scoreAnalysis.maxScore}</span>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">总得分</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {studentReport.scoreAnalysis.percentage}%
                  </div>
                  <p className="text-sm text-green-600 mt-1">正确率</p>
                </div>
                <div className={`rounded-xl p-4 text-center ${
                  studentReport.cheatingAnalysis.warningLevel === 'high' ? 'bg-red-50' :
                  studentReport.cheatingAnalysis.warningLevel === 'medium' ? 'bg-amber-50' :
                  'bg-green-50'
                }`}>
                  <div className={`text-3xl font-bold ${
                    studentReport.cheatingAnalysis.warningLevel === 'high' ? 'text-red-600' :
                    studentReport.cheatingAnalysis.warningLevel === 'medium' ? 'text-amber-600' :
                    'text-green-600'
                  }`}>
                    {studentReport.cheatingAnalysis.cheatingScore}
                  </div>
                  <p className={`text-sm mt-1 ${
                    studentReport.cheatingAnalysis.warningLevel === 'high' ? 'text-red-600' :
                    studentReport.cheatingAnalysis.warningLevel === 'medium' ? 'text-amber-600' :
                    'text-green-600'
                  }`}>
                    作弊风险
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-3">答题用时</h4>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">总用时</span>
                    <span className="font-medium">{studentReport.timeAnalysis.totalAnswerTimeFormatted}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary-500 h-2 rounded-full transition-all"
                      style={{ width: `${studentReport.timeAnalysis.timeUsagePercent}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    使用了 {studentReport.timeAnalysis.timeUsagePercent}% 的考试时长
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">窗口切换次数</div>
                  <div className="text-xl font-bold text-amber-600">{studentReport.cheatingAnalysis.windowSwitchTotalCount || 0}</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">待处理告警</div>
                  <div className="text-xl font-bold text-red-600">{studentReport.cheatingAnalysis.pendingCount || 0}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">已处理告警</div>
                  <div className="text-xl font-bold text-green-600">{studentReport.cheatingAnalysis.resolvedCount || 0}</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">录像片段</div>
                  <div className="text-xl font-bold text-blue-600">{studentReport.recordingsList?.length || 0}</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-3">异常画像</h4>
                
                <div className="flex gap-2 mb-4 flex-wrap">
                  {Object.entries(EVENT_TYPE_META).map(([type, meta]) => {
                    const count = studentReport.cheatingAnalysis.eventsByType?.[type]?.length || 0;
                    return (
                      <button
                        key={type}
                        onClick={() => setActiveEventType(activeEventType === type ? null : type)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                          activeEventType === type 
                            ? `${meta.color} ${meta.textColor} ring-2 ring-offset-1 ring-current`
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span>{meta.icon}</span>
                        <span className="font-medium">{meta.label}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                          count > 0 ? 'bg-white/80 text-gray-700' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {studentReport.cheatingAnalysis.totalAlerts === 0 ? (
                  <div className="bg-green-50 rounded-xl p-6 text-center text-green-700">
                    <div className="text-3xl mb-2">✅</div>
                    无异常事件记录，考试过程非常规范！
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(studentReport.cheatingAnalysis.eventsByType || {}).map(([type, events]) => {
                      if (activeEventType && activeEventType !== type) return null;
                      if (events.length === 0) return null;
                      const meta = EVENT_TYPE_META[type] || { label: type, icon: '⚠️', color: 'bg-gray-50 border-gray-200' };
                      
                      return (
                        <div key={type} className={`border rounded-xl p-4 ${meta.color}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{meta.icon}</span>
                              <span className="font-medium text-gray-800">{meta.label}</span>
                              <span className="text-sm text-gray-500">· 共 {events.length} 次</span>
                            </div>
                          </div>

                          <div className="relative pl-6 space-y-0">
                            {events.map((event, idx) => (
                              <div key={event.id || idx} className="relative pb-3">
                                {idx < events.length - 1 && (
                                  <div className="absolute left-[-18px] top-4 bottom-0 w-0.5 bg-gray-200"></div>
                                )}
                                <div className="absolute left-[-20px] top-1 w-4 h-4 rounded-full border-2 border-white bg-gray-300 shadow"></div>
                                
                                <div className="bg-white/80 rounded-lg p-3 shadow-sm">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <p className="text-sm text-gray-800">{event.description}</p>
                                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                                        <span>⏱️ {formatDuration(event.relative_seconds)}</span>
                                        <span>🕒 {new Date(event.timestamp).toLocaleTimeString('zh-CN')}</span>
                                        <span className={`px-1.5 py-0.5 rounded ${event.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {event.status === 'resolved' ? '已处理' : '待处理'}
                                        </span>
                                      </div>
                                      {event.note && (
                                        <p className="text-xs text-gray-500 mt-1.5 bg-gray-100 rounded p-2">
                                          📝 处理备注：{event.note}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1.5 ml-3">
                                      <button
                                        onClick={() => handlePlayRecordingAt(event)}
                                        className="text-xs px-2 py-1 bg-primary-500 text-white rounded hover:bg-primary-600 transition flex items-center gap-1"
                                      >
                                        ▶ 看录像
                                      </button>
                                      {event.status !== 'resolved' && (
                                        <button
                                          onClick={() => handleMarkResolvedFromReport(event)}
                                          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
                                        >
                                          ✓ 标记处理
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-3">答题详情</h4>
                <div className="space-y-2">
                  {studentReport.behaviorAnalysis.questionAnalysis.map((q, idx) => (
                    <div key={q.questionId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-white rounded flex items-center justify-center text-sm font-medium text-gray-600">
                          {idx + 1}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getQuestionTypeLabel(q.type)}
                        </span>
                      </div>
                      <div className="text-right">
                        {q.isCorrect === true ? (
                          <span className="text-green-500 font-medium text-sm">✓ 正确</span>
                        ) : q.isCorrect === false ? (
                          <span className="text-red-500 font-medium text-sm">✗ 错误</span>
                        ) : q.hasAnswer ? (
                          <span className="text-amber-500 font-medium text-sm">待批改</span>
                        ) : (
                          <span className="text-gray-400 text-sm">未作答</span>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {q.userScore}/{q.score} 分
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRecordingModal && selectedRecording && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-6">
          <div className="bg-black rounded-2xl w-full max-w-5xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-white">
                  🎥 {selectedRecording.type === 'camera' ? '摄像头录像' : '屏幕共享录像'}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {studentReport?.studentInfo?.name} · 跳转至 {formatDuration(seekSeconds)} 处
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRecordingModal(false);
                  setSelectedRecording(null);
                }}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <video
                ref={videoRef}
                src={recordingAPI.getRecordingPlayUrl(selectedRecording.id)}
                controls
                autoPlay
                className="w-full aspect-video bg-black rounded"
                onLoadedMetadata={handleVideoLoaded}
              />
              {seekSeconds > 0 && (
                <p className="text-sm text-gray-400 mt-3 text-center">
                  ⏱️ 已自动跳转到第 {formatDuration(seekSeconds)}（异常发生时间点）
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function StatCard({ title, value, subtitle, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600'
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-3xl font-bold text-gray-800 mt-2">{value}</p>
          <p className="text-gray-400 text-sm mt-1">{subtitle}</p>
        </div>
        <div className={`w-12 h-12 ${colorClasses[color]} rounded-xl flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ScoreDistribution({ distribution, maxScore }) {
  const categories = [
    { key: 'excellent', label: '优秀 (≥90%)', color: 'bg-green-500' },
    { key: 'good', label: '良好 (80-89%)', color: 'bg-blue-500' },
    { key: 'medium', label: '中等 (70-79%)', color: 'bg-amber-500' },
    { key: 'pass', label: '及格 (60-69%)', color: 'bg-orange-500' },
    { key: 'fail', label: '不及格 (<60%)', color: 'bg-red-500' }
  ];

  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-3">
      {categories.map(cat => (
        <div key={cat.key} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-28">{cat.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
            <div
              className={`${cat.color} h-full rounded-full transition-all`}
              style={{ width: `${((distribution[cat.key] || 0) / total) * 100}%` }}
            ></div>
          </div>
          <span className="text-sm font-medium text-gray-700 w-10 text-right">
            {distribution[cat.key] || 0}
          </span>
        </div>
      ))}
    </div>
  );
}

function CheatingDistribution({ stats, total }) {
  const categories = [
    { key: 'lowRisk', label: '低风险', color: 'bg-green-500' },
    { key: 'mediumRisk', label: '中风险', color: 'bg-amber-500' },
    { key: 'highRisk', label: '高风险', color: 'bg-red-500' }
  ];

  return (
    <div className="space-y-3">
      {categories.map(cat => (
        <div key={cat.key} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-20">{cat.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
            <div
              className={`${cat.color} h-full rounded-full transition-all`}
              style={{ width: `${((stats[cat.key] || 0) / total) * 100}%` }}
            ></div>
          </div>
          <span className="text-sm font-medium text-gray-700 w-10 text-right">
            {stats[cat.key] || 0}
          </span>
        </div>
      ))}
    </div>
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
