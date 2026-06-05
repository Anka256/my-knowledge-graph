import { Editor, Node, mergeAttributes } from 'https://esm.sh/@tiptap/core@2.2.4';
    import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.2.4';
    import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.2.4';
    import Mention from 'https://esm.sh/@tiptap/extension-mention@2.2.4';
    import Link from 'https://esm.sh/@tiptap/extension-link@2.2.4';

    const MediaNode = Node.create({
      name: 'media',
      group: 'block',
      atom: true,
      addAttributes() {
        return { src: { default: null }, type: { default: 'image' } }
      },
      parseHTML() { 
        return [
          { tag: 'img[src]', getAttrs: el => ({ src: el.getAttribute('src'), type: 'image' }) },
          { tag: 'video[src]', getAttrs: el => ({ src: el.getAttribute('src'), type: 'video' }) },
          { tag: 'audio[src]', getAttrs: el => ({ src: el.getAttribute('src'), type: 'audio' }) },
          { tag: 'iframe[src]', getAttrs: el => ({ src: el.getAttribute('src'), type: 'video' }) }
        ];
      },
      renderHTML({ HTMLAttributes }) {
        if (HTMLAttributes.type === 'video') return ['video', { controls: true, src: HTMLAttributes.src, style: 'max-width:100%; border-radius:8px;' }];
        if (HTMLAttributes.type === 'audio') return ['audio', { controls: true, src: HTMLAttributes.src, style: 'width:100%;' }];
        return ['img', { src: HTMLAttributes.src, style: 'max-width:100%; border-radius:8px;' }];
      }
    });

    window.TiptapEditor = Editor;
    window.TiptapStarterKit = StarterKit;
    window.TiptapPlaceholder = Placeholder;
    window.TiptapMention = Mention;
    window.TiptapLink = Link;
    window.TiptapMediaNode = MediaNode;
    window.tiptapLoaded = true;
    
    // Dispatch an event to let the main script know Tiptap is ready
    document.dispatchEvent(new Event('tiptap-ready'));
