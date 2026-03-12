export default function ResearchProject() {
  return (
    <div class="flex h-full">
      {/* 左1: 课题总览 */}
      <div class="w-64 border-r p-4">
        <h2>课题总览</h2>
      </div>

      {/* 左2: 对话框 */}
      <div class="w-80 border-r p-4">
        <h2>AI 对话</h2>
      </div>

      {/* 左3: 图谱 */}
      <div class="flex-1 p-4">
        <h2>知识图谱</h2>
      </div>

      {/* 左4: 文件 */}
      <div class="w-64 border-l p-4">
        <h2>项目文件</h2>
      </div>
    </div>
  )
}
