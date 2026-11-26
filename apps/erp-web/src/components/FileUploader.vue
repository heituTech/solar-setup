<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { post } from '@/api/client';

const props = defineProps({
  bizType: { type: String, required: true },
  bizId: { type: [Number, String], default: null },
  accept: { type: String, default: '*/*' },
  buttonText: { type: String, default: '上传文件' },
});
const emit = defineEmits(['uploaded']);
const inputRef = ref();
const uploading = ref(false);

function pick() {
  inputRef.value?.click();
}

async function onChange(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return ElMessage.warning('文件不能超过 20MB');
  uploading.value = true;
  try {
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const data = await post('/files', {
      biz_type: props.bizType,
      biz_id: props.bizId,
      filename: file.name,
      mime: file.type,
      content_base64: content,
    });
    ElMessage.success('上传成功');
    emit('uploaded', data);
  } catch (error) {
    ElMessage.error(error.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <span>
    <el-button size="small" :loading="uploading" @click="pick">{{ buttonText }}</el-button>
    <input ref="inputRef" type="file" :accept="accept" style="display:none" @change="onChange" />
  </span>
</template>
