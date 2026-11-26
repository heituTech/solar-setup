<script setup>
import { nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { post } from '@/api/client';

const messages = ref([
  { role: 'bot', text: '你好，我是光伏工程助手。可以问我：待并网项目、待收款、库存预警、今日销售、某个项目的方案摘要。' },
]);
const input = ref('');
const sending = ref(false);
const listRef = ref();

const QUICK = [
  '帮我列出所有待并网项目，发给施工队长',
  '有哪些待收款',
  '哪些产品库存不足',
  '今天的销售情况',
  '当前项目进度',
];

async function scrollBottom() {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
}

async function send(text) {
  const message = (text ?? input.value).trim();
  if (!message) return;
  messages.value.push({ role: 'user', text: message });
  input.value = '';
  sending.value = true;
  await scrollBottom();
  try {
    const data = await post('/agent/chat', { message });
    messages.value.push({ role: 'bot', text: data.reply || '（无返回内容）' });
  } catch (error) {
    messages.value.push({ role: 'bot', text: `调用失败：${error.message}` });
    ElMessage.error(error.message);
  } finally {
    sending.value = false;
    await scrollBottom();
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-title">AI 助手</div>
      <div class="muted">只调用内部业务接口，不直接读写数据库</div>
    </div>
    <div class="chat-box">
      <div ref="listRef" class="chat-list">
        <div v-for="(message, index) in messages" :key="index" :class="['bubble', message.role]">{{ message.text }}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
        <el-tag v-for="item in QUICK" :key="item" style="cursor:pointer" @click="send(item)">{{ item }}</el-tag>
      </div>
      <div style="display:flex;gap:8px">
        <el-input v-model="input" placeholder="用自然语言描述你要查的内容" @keyup.enter="send()" />
        <el-button type="primary" :loading="sending" @click="send()">发送</el-button>
      </div>
    </div>
  </div>
</template>
