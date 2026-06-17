import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { examAPI, examActionAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';

export default function ProctorRoom() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [cheatingAlerts, setCheatingAlerts] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messageInput, setMessageInput] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTarget, setMessageTarget] = useState(null);
  
  const [alertFilter, setAlertFilter] = useState('pending');
  const [showHandleModal, setShowHandleModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [handleNote, setHandleNote] = useState('');
  
  const socketRef = useRef(null);
  const alertsRef = useRef([]);

  useEffect(() => {
    loadExam();
    loadEnrollments();
    loadCheatingEvents();
    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
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
      setEnrollments(response.data.enrollments);
    } catch (err) {
      console.error('加载考生列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCheatingEvents = async () => {
    try {
      const response = await examActionAPI.getCheatingEvents(examId);
      setCheatingAlerts(response.data.events);
      alertsRef.current = response.data.events;
    } catch (err) {
      console.error('加载作弊事件失败:', err);
    }
  };

  const initSocket = () => {
    socketRef.current = io('/', { path: '/socket.io' });
    
    socketRef.current.on('connect', () => {
      socketRef.current.emit('join_as_teacher', {
        teacherId: user.id,
        examId: examId
      });
    });

    socketRef.current.on('active_students_list', (studentsList) => {
      setStudents(studentsList);
    });

    socketRef.current.on('student_joined', (data) => {
      setStudents(prev => {
        const exists = prev.some(s => s.studentId === data.studentId);
        if (exists) return prev;
        return [...prev, data];
      });
    });

    socketRef.current.on('student_left', (data) => {
      setStudents(prev => prev.filter(s => s.studentId !== data.studentId));
    });

    socketRef.current.on('cheating_alert', (data) => {
      const newAlert = {
        id: data.id || Date.now(),
        ...data,
        event_type: data.eventType,
        student_name: data.studentName,
        timestamp: data.timestamp,
        relative_seconds: data.relativeSeconds || 0,
        recording_type: data.recordingType,
        status: 'pending'
      };
      
      setCheatingAlerts(prev => {
        const exists = prev.some(a => 
          a.id === newAlert.id || 
          (a.event_type === newAlert.event_type && a.studentId === newAlert.studentId && a.status === 'pending')
        );
        if (exists) return prev;
        return [newAlert, ...prev].slice(0, 100);
      });
    });

    socketRef.current.on('cheating_event_updated', (data) => {
      setCheatingAlerts(prev => prev.map(a => {
        if (a.id === data.id) {
          return {
            ...a,
            status: data.status,
            handled_by: data.handledBy,
            handled_at: data.handledAt,
            note: data.note
          };
        }
        return a;
      }));
    });

    socketRef.current.on('student_status_update', (data) => {
      console.log('学生状态更新:', data);
    });
  };

  const handleViewStudent = (student) => {
    setSelectedStudent(student);
    if (socketRef.current) {
      socketRef.current.emit('teacher_request_view', {
        examId,
        studentId: student.studentId,
        teacherId: user.id
      });
    }
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !messageTarget) return;

    if (socketRef.current) {
      socketRef.current.emit('send_message_to_student', {
        examId,
        studentId: messageTarget.studentId,
        message: messageInput,
        teacherId: user.id
      });
    }

    setMessageInput('');
    setShowMessageModal(false);
    setMessageTarget(null);
  };

  const openMessageModal = (student) => {
    setMessageTarget(student);
    setShowMessageModal(true);
  };

  const openHandleModal = (alert) => {
    setSelectedAlert(alert);
    setHandleNote(alert.note || '');
    setShowHandleModal(true);
  };

  const handleMarkResolved = async () => {
    if (!selectedAlert) return;
    try {
      await examActionAPI.handleCheatingEvent(examId, selectedAlert.id, handleNote, 'resolved');
      setShowHandleModal(false);
      setSelectedAlert(null);
      setHandleNote('');
      await loadCheatingEvents();
    } catch (err) {
      console.error('标记处理失败:', err);
      alert('标记失败，请重试');
    }
  };

  const getStudentFrame = (studentId) => {
    return null;
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'danger': return 'bg-red-100 text-red-700 border-red-200';
      case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getEventTypeLabel = (type) => {
    const labels = {
      window_switch_exceeded: '窗口切换超限',
      multiple_faces: '多人脸检测',
      no_face_detected: '未检测到人脸',
      screen_share_stopped: '屏幕共享停止'
    };
    return labels[type] || type;
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return { text: '待处理', className: 'bg-red-500 text-white' };
      case 'resolved': return { text: '已处理', className: 'bg-green-500 text-white' };
      default: return { text: status, className: 'bg-gray-500 text-white' };
    }
  };

  const filteredAlerts = cheatingAlerts.filter(alert => {
    if (alertFilter === 'all') return true;
    return (alert.status || 'pending') === alertFilter;
  });

  const pendingCount = cheatingAlerts.filter(a => (a.status || 'pending') === 'pending').length;
  const resolvedCount = cheatingAlerts.filter(a => a.status === 'resolved').length;

  if (loading) {
    return (
      <Layout title="实时监考">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`实时监考 - ${exam?.title || ''}`}>
      <div className="h-full flex gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800">
              在线考生 ({students.length}人)
            </h3>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-sm text-gray-500">实时监控中</span>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
              <div className="text-6xl mb-4">📹</div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">暂无在线考生</h3>
              <p className="text-gray-500">考生进入考试后会显示在这里</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {students.map((student) => {
                const alertCount = cheatingAlerts.filter(
                  a => a.studentId === student.studentId
                ).length;
                
                return (
                  <div
                    key={student.studentId}
                    onClick={() => handleViewStudent(student)}
                    className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="relative bg-gray-900 aspect-video">
                      <StudentCameraFeed studentId={student.studentId} socket={socketRef.current} />
                      {alertCount > 0 && (
                        <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          {alertCount} 次异常
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        {student.studentName}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="w-96 bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-800">⚠️ 异常事件</h3>
              <div className="flex gap-1 text-xs">
                <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full">{pendingCount} 待处理</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full">{resolvedCount} 已处理</span>
              </div>
            </div>
            <div className="flex gap-1 mt-3">
              {['pending', 'all', 'resolved'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setAlertFilter(filter)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                    alertFilter === filter 
                      ? 'bg-primary-500 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter === 'pending' ? '待处理' : filter === 'all' ? '全部' : '已处理'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-gray-500 text-sm">暂无{alertFilter === 'pending' ? '待处理' : alertFilter === 'resolved' ? '已处理' : ''}异常事件</p>
              </div>
            ) : (
              filteredAlerts.map((alert, index) => {
                const statusLabel = getStatusLabel(alert.status || 'pending');
                return (
                  <div
                    key={alert.id || index}
                    className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)} ${alert.status === 'resolved' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-medium text-sm">{alert.student_name || alert.studentName}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusLabel.className}`}>
                          {statusLabel.text}
                        </span>
                        <span className="text-xs opacity-75">
                          {new Date(alert.timestamp).toLocaleTimeString('zh-CN')}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm mt-1 font-medium">{getEventTypeLabel(alert.event_type || alert.eventType)}</p>
                    <p className="text-xs mt-1 opacity-80">{alert.description}</p>
                    
                    {alert.note && (
                      <div className="mt-2 p-2 bg-white/60 rounded text-xs">
                        <span className="text-gray-500">处理备注：</span>{alert.note}
                      </div>
                    )}
                    
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openMessageModal({
                            studentId: alert.student_id || alert.studentId,
                            studentName: alert.student_name || alert.studentName
                          });
                        }}
                        className="text-xs px-2 py-1 bg-white/50 rounded hover:bg-white/70 transition"
                      >
                        发消息
                      </button>
                      {alert.status !== 'resolved' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openHandleModal(alert);
                          }}
                          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
                        >
                          标记已处理
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {selectedStudent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-8">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-800">{selectedStudent.studentName}</h3>
                <p className="text-sm text-gray-500">实时监控</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openMessageModal(selectedStudent)}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition"
                >
                  发送消息
                </button>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
                <StudentCameraFeed studentId={selectedStudent.studentId} socket={socketRef.current} large />
              </div>
            </div>
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-800 mb-4">
              发送消息给 {messageTarget?.studentName}
            </h3>
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="w-full h-32 p-4 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="请输入消息内容..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setMessageTarget(null);
                  setMessageInput('');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleSendMessage}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}

      {showHandleModal && selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-xl">
              ⚠️
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-800">
                标记告警已处理
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedAlert.student_name || selectedAlert.studentName} · {getEventTypeLabel(selectedAlert.event_type || selectedAlert.eventType)}
              </p>
            </div>
          </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-gray-700">{selectedAlert.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                发生时间：{new Date(selectedAlert.timestamp).toLocaleString('zh-CN')}
              </p>
            </div>
            <textarea
              value={handleNote}
              onChange={(e) => setHandleNote(e.target.value)}
              className="w-full h-24 p-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
              placeholder="请输入处理备注（可选）..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowHandleModal(false);
                  setSelectedAlert(null);
                  setHandleNote('');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleMarkResolved}
                className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition"
              >
                确认处理
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function StudentCameraFeed({ studentId, socket, large = false }) {
  const [frameData, setFrameData] = useState(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleFrame = (data) => {
      if (data.studentId === studentId) {
        setFrameData(data.frameData);
        setIsLive(true);
      }
    };

    socket.on('student_camera_frame', handleFrame);

    const timeout = setInterval(() => {
      if (frameData) {
        setIsLive(prev => {
          if (prev) return false;
          return prev;
        });
      }
    }, 3000);

    return () => {
      socket.off('student_camera_frame', handleFrame);
      clearInterval(timeout);
    };
  }, [socket, studentId]);

  return (
    <div className="w-full h-full flex items-center justify-center relative">
      {frameData ? (
        <img 
          src={frameData} 
          alt="摄像头画面" 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="text-gray-500 text-sm">
          <div className="text-4xl text-center mb-2">📷</div>
          <p>等待画面...</p>
        </div>
      )}
      {isLive && (
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-white bg-black/50 px-1 rounded">LIVE</span>
        </div>
      )}
    </div>
  );
}
