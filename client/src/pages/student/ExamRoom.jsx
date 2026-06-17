import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { examAPI, examActionAPI, recordingAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';
import * as faceapi from 'face-api.js';

export default function ExamRoom() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [exam, setExam] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [examStarted, setExamStarted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [cheatingCount, setCheatingCount] = useState(0);
  const [faceDetected, setFaceDetected] = useState(true);
  const [multipleFacesDetected, setMultipleFacesDetected] = useState(false);
  const [windowSwitchCount, setWindowSwitchCount] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [teacherMessage, setTeacherMessage] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const [recordingStatus, setRecordingStatus] = useState({ camera: false, screen: false });
  
  const videoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const faceDetectionIntervalRef = useRef(null);
  const frameSendIntervalRef = useRef(null);
  const noFaceStartTimeRef = useRef(null);
  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const timerRef = useRef(null);
  const visibilityCleanupRef = useRef(null);
  
  const windowAlertSentRef = useRef(false);
  const windowWarningShownRef = useRef(false);
  const windowSwitchCountRef = useRef(0);
  const noFaceAlertSentRef = useRef(false);
  const multipleFacesAlertSentRef = useRef(false);
  const screenStopAlertSentRef = useRef(false);

  const cameraRecorderRef = useRef(null);
  const screenRecorderRef = useRef(null);
  const cameraChunksRef = useRef([]);
  const screenChunksRef = useRef([]);
  const cameraStartTimeRef = useRef(null);
  const screenStartTimeRef = useRef(null);

  const loadFaceModels = useCallback(async () => {
    try {
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      setModelsLoaded(true);
      console.log('人脸检测模型加载完成');
    } catch (err) {
      console.error('加载人脸检测模型失败:', err);
    }
  }, []);

  useEffect(() => {
    loadFaceModels();
    loadExam();
    
    return () => {
      cleanupResources();
    };
  }, [examId]);

  const cleanupResources = () => {
    stopCameraRecording();
    stopScreenRecording();
    
    if (faceDetectionIntervalRef.current) {
      clearInterval(faceDetectionIntervalRef.current);
    }
    if (frameSendIntervalRef.current) {
      clearInterval(frameSendIntervalRef.current);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (visibilityCleanupRef.current && typeof visibilityCleanupRef.current === 'function') {
      visibilityCleanupRef.current();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const loadExam = async () => {
    try {
      const response = await examAPI.getExam(examId);
      setExam(response.data.exam);
      setTimeLeft(response.data.exam.duration * 60);
    } catch (err) {
      console.error('加载考试失败:', err);
      alert('加载考试失败');
      navigate('/student');
    } finally {
      setLoading(false);
    }
  };

  const startExam = async () => {
    try {
      const response = await examActionAPI.enroll(examId);
      const data = response.data;
      
      setExamStarted(true);
      setEnrollmentId(data.enrollment.id);
      
      setTimeout(() => {
        if (cameraEnabled && !cameraRecorderRef.current) {
          startCameraRecording();
        }
        if (screenSharing && !screenRecorderRef.current) {
          startScreenRecording();
        }
      }, 100);
      
      setTimeLeft(data.remaining_seconds);
      
      if (data.saved_answers && Object.keys(data.saved_answers).length > 0) {
        setAnswers(data.saved_answers);
      }
      
      if (data.window_switch_count) {
        setWindowSwitchCount(data.window_switch_count);
        windowSwitchCountRef.current = data.window_switch_count;
        if (exam?.max_window_switches && data.window_switch_count > exam.max_window_switches) {
          windowAlertSentRef.current = true;
          windowWarningShownRef.current = true;
        }
      }
      
      if (data.cheating_count) {
        setCheatingCount(data.cheating_count);
      }
      
      initSocket();
      startTimer();
      visibilityCleanupRef.current = setupVisibilityListener();
    } catch (err) {
      alert(err.response?.data?.error || '开始考试失败');
    }
  };

  const initSocket = () => {
    socketRef.current = io('/', { path: '/socket.io' });
    
    socketRef.current.on('connect', () => {
      socketRef.current.emit('join_as_student', {
        studentId: user.id,
        examId: examId,
        studentName: user.name
      });
    });

    socketRef.current.on('teacher_watching', (data) => {
      console.log('教师正在查看:', data);
    });

    socketRef.current.on('teacher_message', (data) => {
      setTeacherMessage(data.message);
      setTimeout(() => setTeacherMessage(null), 5000);
    });
  };

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const setupVisibilityListener = () => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        windowSwitchCountRef.current = windowSwitchCountRef.current + 1;
        const newCount = windowSwitchCountRef.current;
        setWindowSwitchCount(newCount);
        
        examActionAPI.logBehavior(examId, 'window_switch', { count: newCount, time: new Date().toISOString() }).catch(() => {});
        
        if (exam?.max_window_switches && newCount > exam.max_window_switches) {
          if (!windowWarningShownRef.current) {
            windowWarningShownRef.current = true;
            showWarningMessage(`警告：您已切换窗口 ${newCount} 次，超过限制（${exam.max_window_switches}次）！请立即停止切换，监考老师已收到通知。`);
          }
          
          if (!windowAlertSentRef.current) {
            windowAlertSentRef.current = true;
            reportCheating('window_switch_exceeded', `切换窗口超过限制${exam.max_window_switches}次，当前已切换${newCount}次`, 'high');
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setCameraEnabled(true);
      
      const faceEnabled = !!exam?.face_detection_enabled;
      if (modelsLoaded && faceEnabled) {
        startFaceDetection();
      }
      
      startFrameSending();
      
      if (enrollmentId) {
        startCameraRecording();
      }
    } catch (err) {
      console.error('开启摄像头失败:', err);
      alert('无法开启摄像头，请检查权限设置');
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      
      screenStreamRef.current = stream;
      
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }
      
      setScreenSharing(true);
      screenStopAlertSentRef.current = false;
      
      if (enrollmentId) {
        startScreenRecording();
      }
      
      stream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        stopScreenRecording();
        if (!screenStopAlertSentRef.current) {
          screenStopAlertSentRef.current = true;
          reportCheating('screen_share_stopped', '屏幕共享被停止', 'warning');
        }
        showWarningMessage('警告：屏幕共享已停止，请重新开启！');
      };
    } catch (err) {
      console.error('屏幕共享失败:', err);
      alert('无法开启屏幕共享，请检查权限设置');
    }
  };

  const startFaceDetection = () => {
    if (faceDetectionIntervalRef.current) {
      clearInterval(faceDetectionIntervalRef.current);
    }

    faceDetectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !videoRef.current.readyState === 4) return;
      
      try {
        const detections = await faceapi.detectAllFaces(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );

        if (detections.length === 0) {
          if (!noFaceStartTimeRef.current) {
            noFaceStartTimeRef.current = Date.now();
          }
          
          const noFaceDuration = (Date.now() - noFaceStartTimeRef.current) / 1000;
          
          if (noFaceDuration > 10) {
            setFaceDetected(false);
            if (!noFaceAlertSentRef.current) {
              noFaceAlertSentRef.current = true;
              reportCheating('no_face_detected', `长时间未检测到人脸（超过${Math.round(noFaceDuration)}秒）`, 'high');
            }
            showWarningMessage('警告：长时间未检测到人脸，请回到摄像头前！');
          }
        } else {
          noFaceStartTimeRef.current = null;
          setFaceDetected(true);
          noFaceAlertSentRef.current = false;
          
          if (detections.length > 1) {
            setMultipleFacesDetected(true);
            if (!multipleFacesAlertSentRef.current) {
              multipleFacesAlertSentRef.current = true;
              reportCheating('multiple_faces', `检测到 ${detections.length} 张人脸`, 'high');
            }
            showWarningMessage('警告：检测到多张人脸，请确保只有您一人在考试！');
          } else {
            setMultipleFacesDetected(false);
            multipleFacesAlertSentRef.current = false;
          }
        }
      } catch (err) {
        console.error('人脸检测出错:', err);
      }
    }, 2000);
  };

  const startFrameSending = () => {
    if (frameSendIntervalRef.current) {
      clearInterval(frameSendIntervalRef.current);
    }

    frameSendIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !socketRef.current) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      const frameData = canvas.toDataURL('image/jpeg', 0.5);
      
      socketRef.current.emit('camera_frame', {
        examId,
        studentId: user.id,
        studentName: user.name,
        frameData
      });
    }, 1000);
  };

  const startCameraRecording = () => {
    if (!streamRef.current || !enrollmentId) return;

    try {
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = undefined;
          }
        }
      }

      cameraChunksRef.current = [];
      const recorder = options ? new MediaRecorder(streamRef.current, options) : new MediaRecorder(streamRef.current);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          cameraChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(cameraChunksRef.current, { type: 'video/webm' });
        const duration = cameraStartTimeRef.current ? (Date.now() - cameraStartTimeRef.current) / 1000 : 0;
        await uploadRecording(blob, 'camera', duration, cameraStartTimeRef.current ? new Date(cameraStartTimeRef.current).toISOString() : new Date().toISOString());
      };

      recorder.start(10000);
      cameraRecorderRef.current = recorder;
      cameraStartTimeRef.current = Date.now();
      setRecordingStatus(prev => ({ ...prev, camera: true }));
    } catch (err) {
      console.error('摄像头录像启动失败:', err);
    }
  };

  const startScreenRecording = () => {
    if (!screenStreamRef.current || !enrollmentId) return;

    try {
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = undefined;
          }
        }
      }

      screenChunksRef.current = [];
      const recorder = options ? new MediaRecorder(screenStreamRef.current, options) : new MediaRecorder(screenStreamRef.current);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          screenChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(screenChunksRef.current, { type: 'video/webm' });
        const duration = screenStartTimeRef.current ? (Date.now() - screenStartTimeRef.current) / 1000 : 0;
        await uploadRecording(blob, 'screen', duration, screenStartTimeRef.current ? new Date(screenStartTimeRef.current).toISOString() : new Date().toISOString());
      };

      recorder.start(10000);
      screenRecorderRef.current = recorder;
      screenStartTimeRef.current = Date.now();
      setRecordingStatus(prev => ({ ...prev, screen: true }));
    } catch (err) {
      console.error('屏幕录像启动失败:', err);
    }
  };

  const stopCameraRecording = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
      try {
        cameraRecorderRef.current.stop();
      } catch (e) {
        console.error('停止摄像头录像失败:', e);
      }
    }
    setRecordingStatus(prev => ({ ...prev, camera: false }));
  };

  const stopScreenRecording = () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      try {
        screenRecorderRef.current.stop();
      } catch (e) {
        console.error('停止屏幕录像失败:', e);
      }
    }
    setRecordingStatus(prev => ({ ...prev, screen: false }));
  };

  const uploadRecording = async (blob, type, duration, startTime) => {
    if (!enrollmentId || blob.size === 0) return;

    try {
      const formData = new FormData();
      formData.append('video', blob, `${type}_${Date.now()}.webm`);
      formData.append('examId', examId);
      formData.append('enrollmentId', enrollmentId.toString());
      formData.append('type', type);
      formData.append('duration', duration.toString());
      formData.append('startTime', startTime);

      setUploadProgress(prev => ({ ...prev, [type]: 0 }));
      await recordingAPI.uploadRecording(formData, (percent) => {
        setUploadProgress(prev => ({ ...prev, [type]: percent }));
      });
      setUploadProgress(prev => ({ ...prev, [type]: 100 }));
      console.log(`${type}录像上传成功`);
    } catch (err) {
      console.error(`${type}录像上传失败:`, err);
    }
  };

  const reportCheating = async (eventType, description, severity = 'warning') => {
    setCheatingCount(prev => prev + 1);
    try {
      await examActionAPI.reportCheating(examId, eventType, description, severity);
      
      if (socketRef.current) {
        socketRef.current.emit('cheating_alert', {
          examId,
          studentId: user.id,
          studentName: user.name,
          eventType,
          description,
          severity
        });
      }
    } catch (err) {
      console.error('上报作弊事件失败:', err);
    }
  };

  const showWarningMessage = (message) => {
    setWarningMessage(message);
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 4000);
  };

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
    
    examActionAPI.submitAnswer(examId, questionId, answer).catch(err => {
      console.error('保存答案失败:', err);
    });
  };

  const handleSubmit = async () => {
    try {
      stopCameraRecording();
      stopScreenRecording();
      
      let waitCount = 0;
      const cameraRecordingActive = cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive';
      const screenRecordingActive = screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive';
      
      while ((cameraRecordingActive || screenRecordingActive) && waitCount < 30) {
        await new Promise(r => setTimeout(r, 500));
        waitCount++;
      }
      
      await examActionAPI.submitExam(examId);
      cleanupResources();
      navigate(`/student/report/${examId}`);
    } catch (err) {
      alert(err.response?.data?.error || '提交失败');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQuestion = exam?.questions?.[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam?.questions?.length || 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">加载考试中...</div>
      </div>
    );
  }

  if (!examStarted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{exam.title}</h1>
            <p className="text-gray-500">{exam.description}</p>
          </div>

          <div className="bg-blue-50 rounded-xl p-5 mb-6">
            <h3 className="font-medium text-blue-800 mb-3">📋 考试须知</h3>
            <ul className="space-y-2 text-sm text-blue-700">
              <li>• 考试时长：{exam.duration} 分钟</li>
              <li>• 题目数量：{exam.questions.length} 题</li>
              <li>• 必须开启摄像头{exam.screen_share_required ? '和屏幕共享' : ''}</li>
              {exam.face_detection_enabled && <li>• 系统将进行人脸检测监控考试过程</li>}
              <li>• 切换窗口超过 {exam.max_window_switches} 次将触发预警</li>
              <li>• 请确保您一人独立完成考试</li>
            </ul>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📷</span>
                <span className="font-medium">摄像头</span>
              </div>
              {cameraEnabled ? (
                <span className="text-green-500 font-medium">已开启 ✓</span>
              ) : (
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition"
                >
                  开启摄像头
                </button>
              )}
            </div>

            {exam.screen_share_required && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🖥️</span>
                  <span className="font-medium">屏幕共享</span>
                </div>
                {screenSharing ? (
                  <span className="text-green-500 font-medium">已开启 ✓</span>
                ) : (
                  <button
                    onClick={startScreenShare}
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition"
                  >
                    开启共享
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={startExam}
            disabled={!cameraEnabled || (exam.screen_share_required && !screenSharing)}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            开始考试
          </button>

          <p className="text-center text-sm text-gray-500 mt-4">
            {!cameraEnabled && '请先开启摄像头' + (exam.screen_share_required && '和屏幕共享')}
            {cameraEnabled && exam.screen_share_required && !screenSharing && '请开启屏幕共享'}
            {cameraEnabled && (!exam.screen_share_required || screenSharing) && '准备就绪，点击开始考试'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-800">{exam.title}</h1>
          <div className="flex items-center gap-2">
            <span className={`recording-dot w-2 h-2 bg-red-500 rounded-full`}></span>
            <span className="text-sm text-red-500 font-medium">录制中</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className={`text-2xl font-bold ${timeLeft < 300 ? 'text-red-500' : 'text-gray-800'}`}>
              {formatTime(timeLeft)}
            </div>
            <div className="text-xs text-gray-500">剩余时间</div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-600">
              {faceDetected ? '人脸正常' : '未检测到人脸'}
            </span>
          </div>

          <div className="text-sm text-gray-600">
            答题进度: {answeredCount}/{totalQuestions}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-20 bg-white border-r border-gray-200 p-3 flex flex-col gap-2 overflow-y-auto">
          {exam.questions.map((q, index) => (
            <button
              key={q.id}
              onClick={() => exam.allow_review || index <= currentQuestionIndex ? setCurrentQuestionIndex(index) : null}
              className={`w-14 h-14 rounded-xl font-medium transition ${
                index === currentQuestionIndex
                  ? 'bg-primary-500 text-white'
                  : answers[q.id]
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!exam.allow_review && index > currentQuestionIndex ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {index + 1}
            </button>
          ))}
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
          {currentQuestion && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm p-8">
                <div className="flex items-center gap-3 mb-6">
                  <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
                    第 {currentQuestionIndex + 1} 题
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                    {currentQuestion.score} 分
                  </span>
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                    {getQuestionTypeLabel(currentQuestion.type)}
                  </span>
                </div>

                <h2 className="text-xl font-medium text-gray-800 mb-8 leading-relaxed">
                  {currentQuestion.content}
                </h2>

                {currentQuestion.type === 'single' && currentQuestion.options && (
                  <div className="space-y-3">
                    {currentQuestion.options.map((option, idx) => (
                      <label
                        key={idx}
                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition ${
                          answers[currentQuestion.id] === option
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQuestion.id}`}
                          value={option}
                          checked={answers[currentQuestion.id] === option}
                          onChange={() => handleAnswer(currentQuestion.id, option)}
                          className="w-5 h-5 text-primary-600"
                        />
                        <span className="ml-3 text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {currentQuestion.type === 'multiple' && currentQuestion.options && (
                  <div className="space-y-3">
                    {currentQuestion.options.map((option, idx) => {
                      const selected = answers[currentQuestion.id]
                        ? JSON.parse(answers[currentQuestion.id]).includes(option)
                        : false;
                      
                      return (
                        <label
                          key={idx}
                          className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition ${
                            selected
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const current = answers[currentQuestion.id]
                                ? JSON.parse(answers[currentQuestion.id])
                                : [];
                              
                              let newAnswers;
                              if (e.target.checked) {
                                newAnswers = [...current, option];
                              } else {
                                newAnswers = current.filter(o => o !== option);
                              }
                              
                              handleAnswer(currentQuestion.id, JSON.stringify(newAnswers));
                            }}
                            className="w-5 h-5 text-primary-600 rounded"
                          />
                          <span className="ml-3 text-gray-700">{option}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.type === 'judge' && (
                  <div className="flex gap-4">
                    {['true', 'false'].map((val) => (
                      <label
                        key={val}
                        className={`flex-1 flex items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition ${
                          answers[currentQuestion.id] === val
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQuestion.id}`}
                          value={val}
                          checked={answers[currentQuestion.id] === val}
                          onChange={() => handleAnswer(currentQuestion.id, val)}
                          className="w-5 h-5 text-primary-600"
                        />
                        <span className="ml-3 text-gray-700 font-medium">
                          {val === 'true' ? '✓ 正确' : '✗ 错误'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {currentQuestion.type === 'short_answer' && (
                  <textarea
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                    placeholder="请输入您的答案..."
                    className="w-full h-40 p-4 border-2 border-gray-200 rounded-xl resize-none focus:border-primary-500 focus:outline-none"
                  />
                )}

                {currentQuestion.type === 'programming' && (
                  <textarea
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                    placeholder="请编写代码..."
                    className="w-full h-64 p-4 font-mono text-sm bg-gray-900 text-green-400 rounded-xl resize-none focus:outline-none font-mono"
                    spellCheck={false}
                  />
                )}

                <div className="flex justify-between mt-8">
                  <button
                    onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0 || !exam.allow_review}
                    className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一题
                  </button>
                  
                  {currentQuestionIndex < totalQuestions - 1 ? (
                    <button
                      onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                      className="px-6 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition"
                    >
                      下一题
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowConfirmSubmit(true)}
                      className="px-6 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition"
                    >
                      交卷
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="w-64 bg-white border-l border-gray-200 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">📷 摄像头</h3>
            <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              {!faceDetected && (
                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">未检测到人脸</span>
                </div>
              )}
              {multipleFacesDetected && (
                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                  多张人脸!
                </div>
              )}
            </div>
          </div>

          {screenSharing && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">🖥️ 屏幕共享</h3>
              <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={screenVideoRef}
                  className="w-full h-full object-contain"
                  muted
                  playsInline
                />
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-700 mb-2">📊 考试状态</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">切换窗口</span>
              <span className="font-medium">
                {windowSwitchCount}
                <span className="ml-1">次</span>
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">异常事件</span>
              <span className={cheatingCount > 0 ? 'font-medium text-red-500' : 'font-medium text-gray-700'}>
                {cheatingCount}
                <span className="ml-1">次</span>
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">人脸状态</span>
              <span className={faceDetected ? 'font-medium text-green-500' : 'font-medium text-red-500'}>
                {faceDetected ? '正常' : '异常'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowConfirmSubmit(true)}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition"
          >
            交卷
          </button>
        </aside>
      </div>

      {showWarning && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-red-500 text-white px-6 py-4 rounded-xl shadow-lg animate-pulse">
            ⚠️ {warningMessage}
          </div>
        </div>
      )}

      {teacherMessage && (
        <div className="fixed top-20 right-6 z-50 bg-blue-500 text-white px-6 py-4 rounded-xl shadow-lg max-w-md">
          <div className="font-medium mb-1">📩 监考老师消息</div>
          <div className="text-sm">{teacherMessage}</div>
        </div>
      )}

      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">确认交卷</h3>
            <p className="text-gray-600 mb-2">您已完成 {answeredCount}/{totalQuestions} 题</p>
            <p className="text-gray-600 mb-6">确定要提交试卷吗？提交后将无法修改答案。</p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
              >
                继续答题
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition"
              >
                确认交卷
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
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
