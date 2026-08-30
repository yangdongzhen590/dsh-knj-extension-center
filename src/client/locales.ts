// zh/en dictionaries for the skill-center locale namespace (`dsh-skill-center`).
// zh is the key-set source of truth (Chinese-first repo convention); en mirrors
// every key and is checked complete against zh at compile time via its
// Record<SkillCenterKey, string> annotation. Copy follows the UI design doc
// dsh-extension-center-ui.html verbatim; `{name}` / `{q}` / `{count}` /
// `{names}` are interpolation placeholders for the view layer.

export const zh = {
  // Sidebar entry
  'entry.label': '技能中心',

  // List panel
  'panel.title': '技能中心',
  'panel.subtitle': '浏览 · 安装 · 管理已加载的 skill',
  'panel.searchPlaceholder': '搜索技能名称或描述…',
  'panel.trashButton': '回收站',
  'panel.installButton': '安装技能',
  'panel.loading': '加载中…',
  'panel.loadError': '技能列表加载失败',
  'panel.retry': '重试',
  'panel.emptyNoSkills': '当前没有已加载的技能',
  'panel.emptyNoMatch': '没有匹配「{q}」的技能',

  // Groups (titles mirror the host group keys bundled / user-dsh / runtime)
  'group.bundled.title': '系统内置',
  'group.bundled.hint': 'DSH 与插件随附的全局技能',
  'group.user-dsh.title': '用户技能（~/.dsh/skills）',
  'group.user-dsh.hint': '本机安装的技能，所有项目共享',
  'group.runtime.title': '运行时注册',
  'group.runtime.hint': '插件运行时代码内嵌注册',

  // Skill cards
  'card.invokable': '可调用：{names}',
  'card.model': '模型',
  'card.user': '用户',
  'card.linked': '软链接',
  'card.toggleTitle': '模型可调用开关（改写 disable-model-invocation）',
  'card.copyPathTitle': '复制路径',
  'card.uninstallTitle': '卸载（移入回收站）',
  'card.copyFail': '复制路径失败',

  // Detail view
  'detail.backToList': '返回列表',
  'detail.copyPath': '复制路径',
  'detail.copyPathToast': '已复制路径',
  'detail.uninstall': '卸载',
  'detail.pathUserSkill': '~/.dsh/skills/{name}/SKILL.md',
  'detail.pathBundled': '系统内置 · 随 DSH 与插件分发',
  'detail.pathRuntime': '运行时注册 · 无文件路径',
  'detail.loadError': '详情加载失败：{error}',

  // Enable/disable toggle feedback
  'toggle.enabledToast': '已启用：{name} 模型可调用',
  'toggle.disabledToast': '已禁用：{name} 模型不可调用',
  'toggle.fail': '切换失败：{error}',

  // Uninstall
  'uninstall.confirm': '删除技能「{name}」？将移入回收站。',
  'uninstall.doneToast': '已移入回收站：{name}',
  'uninstall.fail': '卸载失败：{error}',

  // Trash view
  'trash.back': '返回',
  'trash.title': '回收站',
  'trash.subtitle': '已卸载的技能，可恢复',
  'trash.empty': '回收站是空的',
  'trash.clearAll': '清空回收站',
  'trash.clearAllConfirm': '清空回收站？所有已卸载的技能将被永久删除。',
  'trash.clearAllToast': '回收站已清空',
  'trash.restore': '恢复',
  'trash.purge': '彻底删除',
  'trash.restoreToast': '已恢复：{name}',
  'trash.restoreFail': '恢复失败：{error}',
  'trash.purgeConfirm': '彻底删除「{name}」？此操作不可恢复。',
  'trash.purgeFail': '彻底删除失败：{error}',
  'trash.purgeToast': '已彻底删除',
  'trash.loadError': '回收站加载失败：{error}',
  'trash.clearFail': '清空失败：{error}',

  // Install flow
  'install.title': '安装技能',
  'install.subtitle': '上传 zip 技能包',
  'install.cancel': '取消',
  'install.step1': '选择文件',
  'install.step2': '确认信息',
  'install.step3': '完成',
  'install.dropzoneMain': '点击选择，或将 zip 拖到这里',
  'install.dropzoneSub': '一个 zip = 一个技能目录（<name>/SKILL.md，可带 references/ 附属文件）',
  'install.format': '.zip · 最大 8MB',
  'install.reselect': '重新选择',
  'install.confirmInstall': '安装',
  'install.fieldName': '技能名',
  'install.fieldDescription': '描述',
  'install.fieldTarget': '目标位置',
  'install.fieldContents': '包内容（{count} 个文件）',
  'install.successTitle': '安装成功',
  'install.successOldInTrash': '旧版本已移入回收站',
  'install.finish': '完成',
  'install.doneToast': '安装完成：{name}',

  // Install flow — local zip preview parse errors (step 1)
  'install.errorNotZip': '无法读取该文件：不是有效的 zip 或文件已损坏',
  'install.errorLayout': 'zip 需包含单一技能目录（<name>/SKILL.md）',
  'install.errorNoSkillMd': 'zip 内缺少 {name}/SKILL.md',
  'install.errorInvalidName': '技能名不合法：{name}（需小写 kebab-case，仅小写字母、数字、连字符）',
  'install.errorNoDescription': 'SKILL.md 缺少 description 字段',
  'install.errorTooLarge': '文件超过 8MB 上限',
  'install.errorParse': '无法解析该 zip：{error}',

  // Conflict dialog
  'conflict.title': '技能名已存在',
  'conflict.bodyPrefix': '即将安装的 {name} 与已安装技能重名。',
  'conflict.existingLabel': '现有版本',
  'conflict.explain': '选择「覆盖」会将现有版本移入回收站后安装新版本；选择「取消」放弃本次安装。',
  'conflict.cancel': '取消',
  'conflict.overwrite': '覆盖（旧版入回收站）',

  // Toasts
  'toast.default': '操作成功',
  'toast.copied': '已复制：{name}',
} as const;

/** The skill-center locale namespace key union (zh is the key-set source). */
export type SkillCenterKey = keyof typeof zh;

/** English dictionary; `Record<SkillCenterKey, string>` makes a missing or
 *  mistyped en key a compile error (extra keys are rejected by zh ownership). */
export const en: Record<SkillCenterKey, string> = {
  'entry.label': 'Skill Center',

  'panel.title': 'Skill Center',
  'panel.subtitle': 'Browse · install · manage loaded skills',
  'panel.searchPlaceholder': 'Search skill name or description…',
  'panel.trashButton': 'Trash',
  'panel.installButton': 'Install skill',
  'panel.loading': 'Loading…',
  'panel.loadError': 'Failed to load skills',
  'panel.retry': 'Retry',
  'panel.emptyNoSkills': 'No skills loaded',
  'panel.emptyNoMatch': 'No skills match "{q}"',

  'group.bundled.title': 'System bundled',
  'group.bundled.hint': 'Global skills shipped with DSH and its plugins',
  'group.user-dsh.title': 'User skills (~/.dsh/skills)',
  'group.user-dsh.hint': 'Skills installed on this machine, shared by all projects',
  'group.runtime.title': 'Runtime registered',
  'group.runtime.hint': 'Skills registered at runtime by plugins',

  'card.invokable': 'Invocable: {names}',
  'card.model': 'Model',
  'card.user': 'User',
  'card.linked': 'Symlink',
  'card.toggleTitle': 'Model-invocable switch (writes disable-model-invocation)',
  'card.copyPathTitle': 'Copy path',
  'card.uninstallTitle': 'Uninstall (move to trash)',
  'card.copyFail': 'Failed to copy path',

  'detail.backToList': 'Back to list',
  'detail.copyPath': 'Copy path',
  'detail.copyPathToast': 'Path copied',
  'detail.uninstall': 'Uninstall',
  'detail.pathUserSkill': '~/.dsh/skills/{name}/SKILL.md',
  'detail.pathBundled': 'System bundled · ships with DSH and plugins',
  'detail.pathRuntime': 'Runtime registered · no file path',
  'detail.loadError': 'Failed to load detail: {error}',

  'toggle.enabledToast': 'Enabled: {name} is model-invocable',
  'toggle.disabledToast': 'Disabled: {name} is not model-invocable',
  'toggle.fail': 'Toggle failed: {error}',

  'uninstall.confirm': 'Uninstall "{name}"? It will move to the trash.',
  'uninstall.doneToast': 'Moved to trash: {name}',
  'uninstall.fail': 'Uninstall failed: {error}',

  'trash.back': 'Back',
  'trash.title': 'Trash',
  'trash.subtitle': 'Uninstalled skills, recoverable',
  'trash.empty': 'Trash is empty',
  'trash.clearAll': 'Empty trash',
  'trash.clearAllConfirm': 'Empty the trash? All uninstalled skills will be permanently deleted.',
  'trash.clearAllToast': 'Trash emptied',
  'trash.restore': 'Restore',
  'trash.purge': 'Delete permanently',
  'trash.restoreToast': 'Restored: {name}',
  'trash.restoreFail': 'Restore failed: {error}',
  'trash.purgeConfirm': 'Permanently delete "{name}"? This cannot be undone.',
  'trash.purgeFail': 'Permanent delete failed: {error}',
  'trash.purgeToast': 'Deleted permanently',
  'trash.loadError': 'Failed to load trash: {error}',
  'trash.clearFail': 'Failed to empty trash: {error}',

  'install.title': 'Install skill',
  'install.subtitle': 'Upload a zip skill package',
  'install.cancel': 'Cancel',
  'install.step1': 'Choose file',
  'install.step2': 'Confirm details',
  'install.step3': 'Done',
  'install.dropzoneMain': 'Click to choose, or drag a zip here',
  'install.dropzoneSub': 'One zip = one skill directory (<name>/SKILL.md, optionally with references/)',
  'install.format': '.zip · max 8MB',
  'install.reselect': 'Choose again',
  'install.confirmInstall': 'Install',
  'install.fieldName': 'Skill name',
  'install.fieldDescription': 'Description',
  'install.fieldTarget': 'Target location',
  'install.fieldContents': 'Package contents ({count} files)',
  'install.successTitle': 'Installed successfully',
  'install.successOldInTrash': 'Old version moved to trash',
  'install.finish': 'Finish',
  'install.doneToast': 'Installed: {name}',

  'install.errorNotZip': 'Cannot read this file: not a valid zip or the file is corrupted',
  'install.errorLayout': 'A zip must contain a single skill directory (<name>/SKILL.md)',
  'install.errorNoSkillMd': 'Missing {name}/SKILL.md in the zip',
  'install.errorInvalidName': 'Invalid skill name: {name} (must be kebab-case: lowercase letters, digits, hyphens)',
  'install.errorNoDescription': 'SKILL.md has no description field',
  'install.errorTooLarge': 'File exceeds the 8MB limit',
  'install.errorParse': 'Cannot parse this zip: {error}',

  'conflict.title': 'Skill name already exists',
  'conflict.bodyPrefix': 'The skill {name} you are installing has the same name as an installed skill.',
  'conflict.existingLabel': 'Existing version',
  'conflict.explain':
    'Choosing "Overwrite" moves the existing version to the trash and installs the new one; choosing "Cancel" abandons this install.',
  'conflict.cancel': 'Cancel',
  'conflict.overwrite': 'Overwrite (old version to trash)',

  'toast.default': 'Operation successful',
  'toast.copied': 'Copied: {name}',
};
