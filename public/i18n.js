(function() {
  var SUPPORTED_LANGS = ['en', 'es', 'fr', 'de', 'ja', 'zh'];
  var DEFAULT_LANG = 'en';
  var currentLang = localStorage.getItem('keycode_lang') || navigator.language?.split('-')[0] || DEFAULT_LANG;
  if (SUPPORTED_LANGS.indexOf(currentLang) === -1) currentLang = DEFAULT_LANG;

  var translations = {
    en: {
      'nav.ai_studio': 'AI Studio',
      'nav.gallery': 'Gallery',
      'nav.pricing': 'Pricing',
      'nav.docs': 'Docs',
      'nav.status': 'Status',
      'nav.support': 'Support',
      'nav.login': 'Sign In',
      'nav.get_started': 'Get Started',
      'nav.dashboard': 'Dashboard',
      'footer.tagline': 'Build the future, one project at a time.',
      'footer.product': 'Product',
      'footer.resources': 'Resources',
      'footer.company': 'Company',
      'footer.privacy': 'Privacy Policy',
      'footer.terms': 'Terms of Service',
      'footer.cookies': 'Cookie Policy',
      'footer.contact': 'Contact Us',
      'footer.copyright': 'KEYCODE Studio. All rights reserved.',
      'common.loading': 'Loading...',
      'common.error': 'Something went wrong',
      'common.retry': 'Retry',
      'common.close': 'Close',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.copy': 'Copy',
      'common.copied': 'Copied!',
      'common.search': 'Search...',
      'common.no_results': 'No results found',
      'common.view_all': 'View All',
      'theme.light': 'Light Mode',
      'theme.dark': 'Dark Mode',
      'notifications.empty': 'No notifications yet',
      'notifications.title': 'Notifications',
      'notifications.mark_read': 'Mark all as read',
      'language.label': 'Language'
    },
    es: {
      'nav.ai_studio': 'AI Studio',
      'nav.gallery': 'Galería',
      'nav.pricing': 'Precios',
      'nav.docs': 'Documentación',
      'nav.status': 'Estado',
      'nav.support': 'Soporte',
      'nav.login': 'Iniciar Sesión',
      'nav.get_started': 'Comenzar',
      'nav.dashboard': 'Panel',
      'footer.tagline': 'Construye el futuro, un proyecto a la vez.',
      'footer.product': 'Producto',
      'footer.resources': 'Recursos',
      'footer.company': 'Empresa',
      'footer.privacy': 'Política de Privacidad',
      'footer.terms': 'Términos del Servicio',
      'footer.cookies': 'Política de Cookies',
      'footer.contact': 'Contáctenos',
      'footer.copyright': 'KEYCODE Studio. Todos los derechos reservados.',
      'common.loading': 'Cargando...',
      'common.error': 'Algo salió mal',
      'common.retry': 'Reintentar',
      'common.close': 'Cerrar',
      'common.save': 'Guardar',
      'common.cancel': 'Cancelar',
      'common.delete': 'Eliminar',
      'common.copy': 'Copiar',
      'common.copied': '¡Copiado!',
      'common.search': 'Buscar...',
      'common.no_results': 'Sin resultados',
      'common.view_all': 'Ver Todo',
      'theme.light': 'Modo Claro',
      'theme.dark': 'Modo Oscuro',
      'notifications.empty': 'Sin notificaciones',
      'notifications.title': 'Notificaciones',
      'notifications.mark_read': 'Marcar todo leído',
      'language.label': 'Idioma'
    },
    fr: {
      'nav.ai_studio': 'AI Studio',
      'nav.gallery': 'Galerie',
      'nav.pricing': 'Tarifs',
      'nav.docs': 'Docs',
      'nav.status': 'Statut',
      'nav.support': 'Support',
      'nav.login': 'Connexion',
      'nav.get_started': 'Commencer',
      'nav.dashboard': 'Tableau de bord',
      'footer.tagline': 'Construisez l\'avenir, un projet à la fois.',
      'footer.product': 'Produit',
      'footer.resources': 'Ressources',
      'footer.company': 'Entreprise',
      'footer.privacy': 'Confidentialité',
      'footer.terms': 'Conditions d\'utilisation',
      'footer.cookies': 'Politique des cookies',
      'footer.contact': 'Contactez-nous',
      'footer.copyright': 'KEYCODE Studio. Tous droits réservés.',
      'common.loading': 'Chargement...',
      'common.error': 'Une erreur est survenue',
      'common.retry': 'Réessayer',
      'common.close': 'Fermer',
      'common.save': 'Enregistrer',
      'common.cancel': 'Annuler',
      'common.delete': 'Supprimer',
      'common.copy': 'Copier',
      'common.copied': 'Copié!',
      'common.search': 'Rechercher...',
      'common.no_results': 'Aucun résultat',
      'common.view_all': 'Voir tout',
      'theme.light': 'Mode Clair',
      'theme.dark': 'Mode Sombre',
      'notifications.empty': 'Aucune notification',
      'notifications.title': 'Notifications',
      'notifications.mark_read': 'Tout marquer lu',
      'language.label': 'Langue'
    },
    de: {
      'nav.ai_studio': 'AI Studio',
      'nav.gallery': 'Galerie',
      'nav.pricing': 'Preise',
      'nav.docs': 'Dokumentation',
      'nav.status': 'Status',
      'nav.support': 'Support',
      'nav.login': 'Anmelden',
      'nav.get_started': 'Loslegen',
      'nav.dashboard': 'Dashboard',
      'footer.tagline': 'Baue die Zukunft, ein Projekt nach dem anderen.',
      'footer.product': 'Produkt',
      'footer.resources': 'Ressourcen',
      'footer.company': 'Unternehmen',
      'footer.privacy': 'Datenschutz',
      'footer.terms': 'Nutzungsbedingungen',
      'footer.cookies': 'Cookie-Richtlinie',
      'footer.contact': 'Kontakt',
      'footer.copyright': 'KEYCODE Studio. Alle Rechte vorbehalten.',
      'common.loading': 'Laden...',
      'common.error': 'Etwas ist schiefgelaufen',
      'common.retry': 'Erneut versuchen',
      'common.close': 'Schließen',
      'common.save': 'Speichern',
      'common.cancel': 'Abbrechen',
      'common.delete': 'Löschen',
      'common.copy': 'Kopieren',
      'common.copied': 'Kopiert!',
      'common.search': 'Suchen...',
      'common.no_results': 'Keine Ergebnisse',
      'common.view_all': 'Alle anzeigen',
      'theme.light': 'Heller Modus',
      'theme.dark': 'Dunkler Modus',
      'notifications.empty': 'Keine Benachrichtigungen',
      'notifications.title': 'Benachrichtigungen',
      'notifications.mark_read': 'Alle als gelesen markieren',
      'language.label': 'Sprache'
    },
    ja: {
      'nav.ai_studio': 'AIスタジオ',
      'nav.gallery': 'ギャラリー',
      'nav.pricing': '料金',
      'nav.docs': 'ドキュメント',
      'nav.status': 'ステータス',
      'nav.support': 'サポート',
      'nav.login': 'ログイン',
      'nav.get_started': 'はじめる',
      'nav.dashboard': 'ダッシュボード',
      'footer.tagline': '未来を築く、一度にひとつのプロジェクト。',
      'footer.product': '製品',
      'footer.resources': 'リソース',
      'footer.company': '会社',
      'footer.privacy': 'プライバシーポリシー',
      'footer.terms': '利用規約',
      'footer.cookies': 'Cookieポリシー',
      'footer.contact': 'お問い合わせ',
      'footer.copyright': 'KEYCODE Studio. 全著作権所有。',
      'common.loading': '読み込み中...',
      'common.error': 'エラーが発生しました',
      'common.retry': '再試行',
      'common.close': '閉じる',
      'common.save': '保存',
      'common.cancel': 'キャンセル',
      'common.delete': '削除',
      'common.copy': 'コピー',
      'common.copied': 'コピーしました!',
      'common.search': '検索...',
      'common.no_results': '結果が見つかりません',
      'common.view_all': 'すべて表示',
      'theme.light': 'ライトモード',
      'theme.dark': 'ダークモード',
      'notifications.empty': '通知はありません',
      'notifications.title': '通知',
      'notifications.mark_read': 'すべて既読にする',
      'language.label': '言語'
    },
    zh: {
      'nav.ai_studio': 'AI工作室',
      'nav.gallery': '作品集',
      'nav.pricing': '价格',
      'nav.docs': '文档',
      'nav.status': '状态',
      'nav.support': '支持',
      'nav.login': '登录',
      'nav.get_started': '开始使用',
      'nav.dashboard': '控制面板',
      'footer.tagline': '构建未来，一次一个项目。',
      'footer.product': '产品',
      'footer.resources': '资源',
      'footer.company': '公司',
      'footer.privacy': '隐私政策',
      'footer.terms': '服务条款',
      'footer.cookies': 'Cookie政策',
      'footer.contact': '联系我们',
      'footer.copyright': 'KEYCODE Studio. 保留所有权利。',
      'common.loading': '加载中...',
      'common.error': '出了点问题',
      'common.retry': '重试',
      'common.close': '关闭',
      'common.save': '保存',
      'common.cancel': '取消',
      'common.delete': '删除',
      'common.copy': '复制',
      'common.copied': '已复制!',
      'common.search': '搜索...',
      'common.no_results': '未找到结果',
      'common.view_all': '查看全部',
      'theme.light': '浅色模式',
      'theme.dark': '深色模式',
      'notifications.empty': '暂无通知',
      'notifications.title': '通知',
      'notifications.mark_read': '全部标为已读',
      'language.label': '语言'
    }
  };

  function t(key) {
    return translations[currentLang]?.[key] || translations[DEFAULT_LANG]?.[key] || key;
  }

  function setLang(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) return;
    currentLang = lang;
    localStorage.setItem('keycode_lang', lang);
    document.documentElement.lang = lang;
    applyTranslations();
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: lang } }));
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var translated = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translated;
      } else {
        el.textContent = translated;
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  // Language selector HTML
  function getLanguageSelectorHTML() {
    var langNames = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', ja: '日本語', zh: '中文' };
    var html = '<select id="lang-selector" onchange="window.__setLanguage(this.value)" style="background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;cursor:pointer">';
    SUPPORTED_LANGS.forEach(function(l) {
      html += '<option value="' + l + '"' + (l === currentLang ? ' selected' : '') + '>' + langNames[l] + '</option>';
    });
    html += '</select>';
    return html;
  }

  window.__t = t;
  window.__setLang = setLang;
  window.__getLang = function() { return currentLang; };
  window.__getLanguageSelector = getLanguageSelectorHTML;

  // Init: set lang attribute on html, apply translations after DOM ready
  document.documentElement.lang = currentLang;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTranslations);
  } else {
    applyTranslations();
  }
})();
