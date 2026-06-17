import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { examAPI } from '../../services/api';

export default function ExamEditor() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const isEdit = examId !== 'new';

  const [exam, setExam] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    duration: 60,
    allow_review: true,
    max_window_switches: 3,
    face_detection_enabled: true,
    screen_share_required: true,
    questions: []
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  const [questionForm, setQuestionForm] = useState({
    type: 'single',
    content: '',
    options: ['', '', '', ''],
    answer: '',
    score: 10
  });

  useEffect(() => {
    if (isEdit) {
      loadExam();
    }
  }, [examId]);

  const loadExam = async () => {
    setLoading(true);
    try {
      const response = await examAPI.getExam(examId);
      const examData = response.data.exam;
      setExam({
        ...examData,
        allow_review: !!examData.allow_review,
        face_detection_enabled: !!examData.face_detection_enabled,
        screen_share_required: !!examData.screen_share_required
      });
    } catch (err) {
      alert('加载考试失败: ' + (err.response?.data?.error || err.message));
      navigate('/teacher');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!exam.title) {
      alert('请输入考试标题');
      return;
    }
    if (!exam.start_time || !exam.end_time) {
      alert('请设置考试时间');
      return;
    }

    setSaving(true);
    try {
      const examData = {
        title: exam.title,
        description: exam.description,
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration: exam.duration,
        allow_review: exam.allow_review,
        max_window_switches: exam.max_window_switches,
        face_detection_enabled: exam.face_detection_enabled,
        screen_share_required: exam.screen_share_required
      };

      if (isEdit) {
        await examAPI.updateExam(examId, examData);
      } else {
        const response = await examAPI.createExam(examData);
        navigate(`/teacher/exam/${response.data.id}/edit`);
        return;
      }

      alert('保存成功');
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = () => {
    setEditingQuestion(null);
    setQuestionForm({
      type: 'single',
      content: '',
      options: ['', '', '', ''],
      answer: '',
      score: 10
    });
    setShowQuestionModal(true);
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question);
    setQuestionForm({
      type: question.type,
      content: question.content,
      options: question.options ? [...question.options] : ['', '', '', ''],
      answer: question.answer || '',
      score: question.score
    });
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.content.trim()) {
      alert('请输入题目内容');
      return;
    }

    try {
      let answer = questionForm.answer;
      let options = null;

      if (questionForm.type === 'single' || questionForm.type === 'multiple') {
        const validOptions = questionForm.options.filter(o => o.trim());
        if (validOptions.length < 2) {
          alert('请至少填写2个选项');
          return;
        }
        options = validOptions;

        if (questionForm.type === 'single' && !answer) {
          alert('请选择正确答案');
          return;
        }
        if (questionForm.type === 'multiple') {
          if (!answer || answer.length === 0) {
            alert('请选择正确答案');
            return;
          }
          answer = JSON.stringify(answer);
        }
      }

      if (questionForm.type === 'judge') {
        if (!answer) {
          alert('请选择正确答案');
          return;
        }
      }

      const questionData = {
        type: questionForm.type,
        content: questionForm.content,
        options: options,
        answer: answer,
        score: questionForm.score,
        order_index: editingQuestion ? editingQuestion.order_index : exam.questions.length + 1
      };

      if (editingQuestion) {
        await examAPI.updateQuestion(examId, editingQuestion.id, questionData);
      } else {
        await examAPI.addQuestion(examId, questionData);
      }

      setShowQuestionModal(false);
      loadExam();
    } catch (err) {
      alert('保存题目失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm('确定要删除这个题目吗？')) return;
    
    try {
      await examAPI.deleteQuestion(examId, questionId);
      loadExam();
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleQuestionTypeChange = (type) => {
    let newOptions = ['', '', '', ''];
    let newAnswer = '';

    if (type === 'judge') {
      newOptions = null;
    }

    setQuestionForm(prev => ({
      ...prev,
      type,
      options: newOptions,
      answer: newAnswer
    }));
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...questionForm.options];
    newOptions[index] = value;
    setQuestionForm(prev => ({ ...prev, options: newOptions }));
  };

  const handleMultipleAnswerToggle = (option) => {
    let currentAnswer = questionForm.answer || [];
    if (typeof currentAnswer === 'string') {
      currentAnswer = JSON.parse(currentAnswer || '[]');
    }
    
    let newAnswer;
    if (currentAnswer.includes(option)) {
      newAnswer = currentAnswer.filter(o => o !== option);
    } else {
      newAnswer = [...currentAnswer, option];
    }
    
    setQuestionForm(prev => ({ ...prev, answer: newAnswer }));
  };

  const addOption = () => {
    setQuestionForm(prev => ({
      ...prev,
      options: [...prev.options, '']
    }));
  };

  const removeOption = (index) => {
    if (questionForm.options.length <= 2) {
      alert('至少需要2个选项');
      return;
    }
    const newOptions = questionForm.options.filter((_, i) => i !== index);
    setQuestionForm(prev => ({ ...prev, options: newOptions }));
  };

  const questionTypes = [
    { value: 'single', label: '单选题' },
    { value: 'multiple', label: '多选题' },
    { value: 'judge', label: '判断题' },
    { value: 'short_answer', label: '简答题' },
    { value: 'programming', label: '编程题' }
  ];

  if (loading && isEdit) {
    return (
      <Layout title="编辑考试">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isEdit ? '编辑考试' : '创建考试'}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">基本信息</h2>
          
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">考试标题 *</label>
              <input
                type="text"
                value={exam.title}
                onChange={(e) => setExam(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                placeholder="请输入考试标题"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">考试描述</label>
              <textarea
                value={exam.description}
                onChange={(e) => setExam(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                rows={3}
                placeholder="请输入考试描述"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">开始时间 *</label>
                <input
                  type="datetime-local"
                  value={exam.start_time ? exam.start_time.slice(0, 16) : ''}
                  onChange={(e) => setExam(prev => ({ ...prev, start_time: new Date(e.target.value).toISOString() }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">结束时间 *</label>
                <input
                  type="datetime-local"
                  value={exam.end_time ? exam.end_time.slice(0, 16) : ''}
                  onChange={(e) => setExam(prev => ({ ...prev, end_time: new Date(e.target.value).toISOString() }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">考试时长（分钟）*</label>
                <input
                  type="number"
                  value={exam.duration}
                  onChange={(e) => setExam(prev => ({ ...prev, duration: parseInt(e.target.value) || 60 }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  min={1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">最大窗口切换次数</label>
                <input
                  type="number"
                  value={exam.max_window_switches}
                  onChange={(e) => setExam(prev => ({ ...prev, max_window_switches: parseInt(e.target.value) || 3 }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exam.allow_review}
                  onChange={(e) => setExam(prev => ({ ...prev, allow_review: e.target.checked }))}
                  className="w-5 h-5 text-primary-600 rounded"
                />
                <span className="text-gray-700">允许学生回看已答题目</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exam.face_detection_enabled}
                  onChange={(e) => setExam(prev => ({ ...prev, face_detection_enabled: e.target.checked }))}
                  className="w-5 h-5 text-primary-600 rounded"
                />
                <span className="text-gray-700">启用人脸检测</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exam.screen_share_required}
                  onChange={(e) => setExam(prev => ({ ...prev, screen_share_required: e.target.checked }))}
                  className="w-5 h-5 text-primary-600 rounded"
                />
                <span className="text-gray-700">要求屏幕共享</span>
              </label>
            </div>
          </div>
        </div>

        {isEdit && (
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">题目管理</h2>
              <button
                onClick={handleAddQuestion}
                className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
              >
                <span>+</span> 添加题目
              </button>
            </div>

            {exam.questions.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-gray-500">暂无题目，点击上方按钮添加</p>
              </div>
            ) : (
              <div className="space-y-3">
                {exam.questions.map((q, index) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
                  >
                    <div className="flex items-center gap-4">
                      <span className="w-10 h-10 bg-white rounded-lg flex items-center justify-center font-medium text-gray-600">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-gray-800 font-medium line-clamp-1">{q.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {questionTypes.find(t => t.value === q.type)?.label || q.type}
                          </span>
                          <span className="text-xs text-gray-500">{q.score} 分</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditQuestion(q)}
                        className="p-2 text-gray-500 hover:text-primary-500 hover:bg-white rounded-lg transition"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-white rounded-lg transition"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-4">
          <button
            onClick={() => navigate('/teacher')}
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {showQuestionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingQuestion ? '编辑题目' : '添加题目'}
            </h3>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">题目类型</label>
                <div className="flex flex-wrap gap-2">
                  {questionTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => handleQuestionTypeChange(type.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        questionForm.type === type.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">题目内容 *</label>
                <textarea
                  value={questionForm.content}
                  onChange={(e) => setQuestionForm(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                  rows={3}
                  placeholder="请输入题目内容"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分值</label>
                <input
                  type="number"
                  value={questionForm.score}
                  onChange={(e) => setQuestionForm(prev => ({ ...prev, score: parseInt(e.target.value) || 10 }))}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  min={1}
                />
              </div>

              {(questionForm.type === 'single' || questionForm.type === 'multiple') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">选项</label>
                  <div className="space-y-2">
                    {questionForm.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-3">
                        {questionForm.type === 'single' ? (
                          <input
                            type="radio"
                            name="correct_answer"
                            checked={questionForm.answer === option && option !== ''}
                            onChange={() => setQuestionForm(prev => ({ ...prev, answer: option }))}
                            className="w-5 h-5 text-primary-600"
                            disabled={option === ''}
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={
                              questionForm.answer && 
                              (Array.isArray(questionForm.answer) 
                                ? questionForm.answer.includes(option)
                                : JSON.parse(questionForm.answer || '[]').includes(option))
                            }
                            onChange={() => handleMultipleAnswerToggle(option)}
                            className="w-5 h-5 text-primary-600 rounded"
                            disabled={option === ''}
                          />
                        )}
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                          placeholder={`选项 ${index + 1}`}
                        />
                        <button
                          onClick={() => removeOption(index)}
                          className="text-gray-400 hover:text-red-500 px-2"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addOption}
                    className="mt-3 text-sm text-primary-500 hover:text-primary-600"
                  >
                    + 添加选项
                  </button>
                </div>
              )}

              {questionForm.type === 'judge' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">正确答案</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="judge_answer"
                        value="true"
                        checked={questionForm.answer === 'true'}
                        onChange={() => setQuestionForm(prev => ({ ...prev, answer: 'true' }))}
                        className="w-5 h-5 text-primary-600"
                      />
                      <span className="text-gray-700">正确 ✓</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="judge_answer"
                        value="false"
                        checked={questionForm.answer === 'false'}
                        onChange={() => setQuestionForm(prev => ({ ...prev, answer: 'false' }))}
                        className="w-5 h-5 text-primary-600"
                      />
                      <span className="text-gray-700">错误 ✗</span>
                    </label>
                  </div>
                </div>
              )}

              {(questionForm.type === 'short_answer' || questionForm.type === 'programming') && (
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-sm text-amber-800">
                    💡 {questionForm.type === 'short_answer' ? '简答题' : '编程题'}需要手动批改，不自动评分。
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button
                onClick={() => setShowQuestionModal(false)}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleSaveQuestion}
                className="px-6 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
