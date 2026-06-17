import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { examActionAPI, examAPI, recordingAPI } from '../../services/api';

export default function GradingPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  
  const [exam, setExam] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [currentAnswerIndex, setCurrentAnswerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gradingLoading, setGradingLoading] = useState(false);
  
  const [scoreInput, setScoreInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  
  const [recordings, setRecordings] = useState([]);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState(null);

  useEffect(() => {
    loadExam();
    loadEnrollments();
  }, [examId]);

  const loadExam = async () => {
    try {
      const response = await examAPI.getExam(examId);
      setExam(response.data.exam);
    } catch (err) {
      console.error('加载考试失败:', err);
    }
  };

  const loadEnrollments = async () => {
    try {
      const response = await examActionAPI.getEnrollments(examId);
      const submitted = response.data.enrollments.filter(e => e.status === 'submitted');
      setEnrollments(submitted);
    } catch (err) {
      console.error('加载考生列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentAnswers = async (enrollmentId) => {
    try {
      const [answersRes, recordingsRes] = await Promise.all([
        examActionAPI.getEnrollmentAnswers(examId, enrollmentId),
        recordingAPI.getEnrollmentRecordings(enrollmentId).catch(() => ({ data: { recordings: [] } }))
      ]);
      
      setAnswers(answersRes.data.answers);
      setSelectedEnrollment(answersRes.data.enrollment);
      setRecordings(recordingsRes.data.recordings || []);
      setCurrentAnswerIndex(0);
      
      const firstUnscored = answersRes.data.answers.findIndex(
        a => a.score === null || a.score === undefined
      );
      if (firstUnscored >= 0) {
        setCurrentAnswerIndex(firstUnscored);
      }
    } catch (err) {
      console.error('加载答案失败:', err);
    }
  };

  const handleGrade = async () => {
    if (!selectedEnrollment || !currentAnswer) return;
    
    const score = parseFloat(scoreInput);
    if (isNaN(score) || score < 0 || score > currentAnswer.question_score) {
      alert(`请输入有效的分数（0 - ${currentAnswer.question_score}）`);
      return;
    }

    setGradingLoading(true);
    try {
      await examActionAPI.gradeAnswer(
        examId,
        selectedEnrollment.id,
        currentAnswer.id,
        score,
        commentInput
      );

      await loadStudentAnswers(selectedEnrollment.id);
      
      const nextIndex = answers.findIndex(
        (a, idx) => idx > currentAnswerIndex && (a.score === null || a.score === undefined)
      );
      
      if (nextIndex >= 0) {
        setCurrentAnswerIndex(nextIndex);
      } else if (currentAnswerIndex < answers.length - 1) {
        setCurrentAnswerIndex(prev => prev + 1);
      }
    } catch (err) {
      alert('评分失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setGradingLoading(false);
    }
  };

  const currentAnswer = answers[currentAnswerIndex];

  useEffect(() => {
    if (currentAnswer) {
      setScoreInput(currentAnswer.score !== null && currentAnswer.score !== undefined 
        ? String(currentAnswer.score) 
        : '');
      setCommentInput(currentAnswer.teacher_comment || '');
    }
  }, [currentAnswerIndex, currentAnswer?.id]);

  const getQuestionTypeLabel = (type) => {
    const labels = {
      single: '单选题',
      multiple: '多选题',
      judge: '判断题',
      short_answer: '简答题',
      programming: '编程题'
    };
    return labels[type] || type;
  };

  const needsManualGrading = (type) => {
    return type === 'short_answer' || type === 'programming';
  };

  const renderAnswer = (answer) => {
    if (!answer.answer || answer.answer === '') {
      return <span className="text-gray-400 italic">未作答</span>;
    }

    if (answer.question_type === 'programming') {
      return (
        <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-sm font-mono whitespace-pre-wrap overflow-x-auto">
          {answer.answer}
        </pre>
      );
    }

    if (answer.question_type === 'short_answer') {
      return (
        <div className="bg-gray-50 p-4 rounded-xl whitespace-pre-wrap text-gray-700">
          {answer.answer}
        </div>
      );
    }

    if (answer.question_type === 'multiple') {
      return (
        <div className="space-y-2">
          {answer.question_options?.map((opt, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg ${
                Array.isArray(answer.answer) && answer.answer.includes(opt)
                  ? 'bg-primary-100 text-primary-800'
                  : 'bg-gray-50 text-gray-600'
              }`}
            >
              {Array.isArray(answer.answer) && answer.answer.includes(opt) ? '✓ ' : '○ '}
              {opt}
            </div>
          ))}
        </div>
      );
    }

    if (answer.question_type === 'single') {
      return (
        <div className="space-y-2">
          {answer.question_options?.map((opt, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg ${
                answer.answer === opt
                  ? 'bg-primary-100 text-primary-800'
                  : 'bg-gray-50 text-gray-600'
              }`}
            >
              {answer.answer === opt ? '● ' : '○ '}
              {opt}
            </div>
          ))}
        </div>
      );
    }

    if (answer.question_type === 'judge') {
      return (
        <span className="text-lg font-medium text-gray-700">
          {answer.answer === 'true' ? '✓ 正确' : '✗ 错误'}
        </span>
      );
    }

    return <span className="text-gray-700">{answer.answer}</span>;
  };

  const scoredCount = answers.filter(a => a.score !== null && a.score !== undefined).length;

  if (loading) {
    return (
      <Layout title="试卷批改">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`试卷批改 - ${exam?.title || ''}`}>
      <div className="h-full flex gap-6">
        <aside className="w-72 bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-medium text-gray-800">考生列表</h3>
            <p className="text-xs text-gray-500 mt-1">共 {enrollments.length} 人已提交</p>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {enrollments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">暂无已提交的试卷</p>
              </div>
            ) : (
              enrollments.map((enrollment) => (
                <button
                  key={enrollment.id}
                  onClick={() => loadStudentAnswers(enrollment.id)}
                  className={`w-full p-4 text-left border-b border-gray-50 hover:bg-gray-50 transition ${
                    selectedEnrollment?.id === enrollment.id ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">{enrollment.student_name}</span>
                    <span className="text-sm text-primary-600 font-medium">
                      {enrollment.score !== null && enrollment.score !== undefined 
                        ? `${enrollment.score}分` 
                        : '待批改'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    作弊分: {enrollment.cheating_score || 0}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="flex-1">
          {!selectedEnrollment ? (
            <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
              <div className="text-6xl mb-4">✏️</div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">选择考生开始批改</h3>
              <p className="text-gray-500">从左侧列表选择一名考生开始批阅试卷</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    {selectedEnrollment.student_name} 的答卷
                  </h3>
                  <p className="text-sm text-gray-500">
                    得分: {selectedEnrollment.score ?? '待批改'} 分
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  批改进度: {scoredCount}/{answers.length}
                </div>
              </div>

              {recordings.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-5 mb-6">
                  <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                    <span>🎥</span> 考试录像记录
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {recordings.map((rec) => (
                      <button
                        key={rec.id}
                        onClick={() => {
                          setSelectedRecording(rec);
                          setShowRecordingModal(true);
                        }}
                        className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-blue-50 border border-blue-100 transition text-left"
                      >
                        <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-2xl">
                          {rec.type === 'camera' ? '📷' : '🖥️'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm">
                            {rec.type === 'camera' ? '摄像头录像' : '屏幕共享录像'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {rec.duration ? `${Math.round(rec.duration)}秒 · ${(rec.file_size / 1024 / 1024).toFixed(1)}MB` : ''}
                          </p>
                        </div>
                        <span className="text-primary-500 text-sm">▶ 播放</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-6 flex-wrap">
                {answers.map((ans, idx) => (
                  <button
                    key={ans.id}
                    onClick={() => setCurrentAnswerIndex(idx)}
                    className={`w-10 h-10 rounded-lg font-medium text-sm transition ${
                      idx === currentAnswerIndex
                        ? 'bg-primary-500 text-white'
                        : ans.score !== null && ans.score !== undefined
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>

              {currentAnswer && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
                        第 {currentAnswerIndex + 1} 题
                      </span>
                      <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                        {currentAnswer.question_score} 分
                      </span>
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                        {getQuestionTypeLabel(currentAnswer.question_type)}
                      </span>
                      {!needsManualGrading(currentAnswer.question_type) && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                          已自动评分
                        </span>
                      )}
                    </div>
                    <h4 className="text-lg font-medium text-gray-800 leading-relaxed">
                      {currentAnswer.question_content}
                    </h4>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-3">学生答案</h5>
                    {renderAnswer(currentAnswer)}
                  </div>

                  {currentAnswer.correct_answer && currentAnswer.question_type !== 'short_answer' && currentAnswer.question_type !== 'programming' && (
                    <div className="bg-green-50 p-4 rounded-xl">
                      <h5 className="text-sm font-medium text-green-800 mb-2">正确答案</h5>
                      {currentAnswer.question_type === 'multiple' ? (
                        <div className="text-green-700">
                          {Array.isArray(currentAnswer.correct_answer) 
                            ? currentAnswer.correct_answer.join('、')
                            : currentAnswer.correct_answer}
                        </div>
                      ) : currentAnswer.question_type === 'judge' ? (
                        <span className="text-green-700">
                          {currentAnswer.correct_answer === 'true' ? '正确' : '错误'}
                        </span>
                      ) : (
                        <span className="text-green-700">{currentAnswer.correct_answer}</span>
                      )}
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-6">
                    <h5 className="text-sm font-medium text-gray-700 mb-4">评分</h5>
                    <div className="flex gap-4 items-start">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">得分</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={scoreInput}
                            onChange={(e) => setScoreInput(e.target.value)}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                            min={0}
                            max={currentAnswer.question_score}
                            step={0.5}
                          />
                          <span className="text-gray-500">/ {currentAnswer.question_score} 分</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs text-gray-500 mb-1">评语</label>
                      <textarea
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                        placeholder="请输入评语..."
                      />
                    </div>

                    <div className="flex justify-between mt-6">
                      <button
                        onClick={() => setCurrentAnswerIndex(Math.max(0, currentAnswerIndex - 1))}
                        disabled={currentAnswerIndex === 0}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        上一题
                      </button>
                      
                      <button
                        onClick={handleGrade}
                        disabled={gradingLoading}
                        className="px-6 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition disabled:opacity-50"
                      >
                        {gradingLoading ? '保存中...' : '保存评分'}
                      </button>
                      
                      <button
                        onClick={() => setCurrentAnswerIndex(Math.min(answers.length - 1, currentAnswerIndex + 1))}
                        disabled={currentAnswerIndex === answers.length - 1}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        下一题
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRecordingModal && selectedRecording && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  {selectedRecording.type === 'camera' ? '📷 摄像头录像' : '🖥️ 屏幕共享录像'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  开始时间: {new Date(selectedRecording.start_time).toLocaleString('zh-CN')}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRecordingModal(false);
                  setSelectedRecording(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-black flex items-center justify-center p-4 overflow-hidden">
              <video
                controls
                src={recordingAPI.getRecordingPlayUrl(selectedRecording.id)}
                className="max-w-full max-h-full rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
