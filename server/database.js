const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

let db = {
  users: [],
  exams: [],
  questions: [],
  exam_enrollments: [],
  answers: [],
  cheating_events: [],
  behavior_logs: []
};

let nextIds = {
  users: 1,
  exams: 1,
  questions: 1,
  exam_enrollments: 1,
  answers: 1,
  cheating_events: 1,
  behavior_logs: 1
};

function loadDatabase() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(dbFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      db = data.db || db;
      nextIds = data.nextIds || nextIds;
      console.log('数据库加载成功');
    } catch (err) {
      console.error('数据库加载失败，使用初始数据:', err.message);
      initSeedData();
    }
  } else {
    initSeedData();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(dbFile, JSON.stringify({ db, nextIds }, null, 2), 'utf-8');
  } catch (err) {
    console.error('保存数据库失败:', err.message);
  }
}

function initSeedData() {
  const teacherHash = bcrypt.hashSync('teacher123', 10);
  const studentHash = bcrypt.hashSync('student123', 10);

  db.users = [
    { id: 1, username: 'teacher', password: teacherHash, name: '张老师', role: 'teacher', created_at: new Date().toISOString() },
    { id: 2, username: 'student1', password: studentHash, name: '李小明', role: 'student', created_at: new Date().toISOString() },
    { id: 3, username: 'student2', password: studentHash, name: '王小红', role: 'student', created_at: new Date().toISOString() },
    { id: 4, username: 'student3', password: studentHash, name: '赵小刚', role: 'student', created_at: new Date().toISOString() }
  ];

  const now = new Date();
  const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  db.exams = [
    {
      id: 1,
      title: 'JavaScript 基础测试',
      description: '测试 JavaScript 基础知识掌握情况',
      teacher_id: 1,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration: 60,
      allow_review: 1,
      max_window_switches: 3,
      face_detection_enabled: 1,
      screen_share_required: 1,
      status: 'published',
      created_at: new Date().toISOString()
    }
  ];

  db.questions = [
    {
      id: 1,
      exam_id: 1,
      type: 'single',
      content: 'JavaScript 中，以下哪个不是原始数据类型？',
      options: JSON.stringify(['string', 'number', 'array', 'boolean']),
      answer: 'array',
      score: 10,
      order_index: 1,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      exam_id: 1,
      type: 'multiple',
      content: '以下哪些是 JavaScript 的循环语句？（多选）',
      options: JSON.stringify(['for', 'while', 'switch', 'do...while']),
      answer: JSON.stringify(['for', 'while', 'do...while']),
      score: 15,
      order_index: 2,
      created_at: new Date().toISOString()
    },
    {
      id: 3,
      exam_id: 1,
      type: 'judge',
      content: 'JavaScript 是一种强类型语言。',
      options: null,
      answer: 'false',
      score: 5,
      order_index: 3,
      created_at: new Date().toISOString()
    },
    {
      id: 4,
      exam_id: 1,
      type: 'short_answer',
      content: '请简述 JavaScript 中闭包的概念及其用途。',
      options: null,
      answer: null,
      score: 20,
      order_index: 4,
      created_at: new Date().toISOString()
    },
    {
      id: 5,
      exam_id: 1,
      type: 'programming',
      content: '请编写一个 JavaScript 函数，实现数组去重功能。',
      options: null,
      answer: null,
      score: 30,
      order_index: 5,
      created_at: new Date().toISOString()
    }
  ];

  nextIds = {
    users: 5,
    exams: 2,
    questions: 6,
    exam_enrollments: 1,
    answers: 1,
    cheating_events: 1,
    behavior_logs: 1
  };

  saveDatabase();
  console.log('初始数据已创建');
}

function getNextId(table) {
  return nextIds[table]++;
}

function getAll(table) {
  return [...db[table]];
}

function getById(table, id) {
  return db[table].find(item => item.id === parseInt(id)) || null;
}

function findOne(table, predicate) {
  return db[table].find(predicate) || null;
}

function findMany(table, predicate) {
  return db[table].filter(predicate);
}

function insert(table, data) {
  const id = getNextId(table);
  const record = { ...data, id, created_at: new Date().toISOString() };
  db[table].push(record);
  saveDatabase();
  return record;
}

function update(table, id, data) {
  const index = db[table].findIndex(item => item.id === parseInt(id));
  if (index === -1) return null;
  
  db[table][index] = { ...db[table][index], ...data };
  saveDatabase();
  return db[table][index];
}

function remove(table, id) {
  const index = db[table].findIndex(item => item.id === parseInt(id));
  if (index === -1) return false;
  
  db[table].splice(index, 1);
  saveDatabase();
  return true;
}

function removeMany(table, predicate) {
  const initialLength = db[table].length;
  db[table] = db[table].filter(item => !predicate(item));
  const removed = initialLength - db[table].length;
  if (removed > 0) saveDatabase();
  return removed;
}

module.exports = {
  loadDatabase,
  saveDatabase,
  getAll,
  getById,
  findOne,
  findMany,
  insert,
  update,
  remove,
  removeMany
};
