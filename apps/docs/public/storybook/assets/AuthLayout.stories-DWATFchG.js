import{j as i,H as a}from"./AppLogo-PvKe3sco.js";import{A as r,I as g}from"./IdentifierForm-Ch09xbh8.js";import{d as G}from"./adapter-interfaces-DIFznudo.js";import"./iframe-BQT3YzO4.js";import"./preload-helper-C1FmrZbK.js";import"./label-DR77zyQb.js";const s={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:G.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},o={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#f3f4f6",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"http://acmelogos.com/images/logo-5.svg",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},q={...o,themeId:"left-layout",displayName:"Left Layout Theme",page_background:{background_color:"#f3f4f6",background_image_url:"",page_layout:"left"},widget:{...o.widget,logo_position:"left"}},E={...o,themeId:"right-layout",displayName:"Right Layout Theme",page_background:{background_color:"#f3f4f6",background_image_url:"",page_layout:"right"},widget:{...o.widget,logo_position:"right"}},$={...o,themeId:"gradient-bg",displayName:"Gradient Background Theme",page_background:{background_color:"#7c3aed",background_image_url:"linear-gradient(135deg, #667eea 0%, #764ba2 100%)",page_layout:"center"},colors:{...o.colors,primary_button:"#7c3aed",base_hover_color:"#6d28d9"}},K={...o,themeId:"image-bg",displayName:"Image Background Theme",page_background:{background_color:"#1f2937",background_image_url:"https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&h=1080&fit=crop",page_layout:"center"},colors:{...o.colors,widget_background:"rgba(255, 255, 255, 0.95)"}},Q={...o,themeId:"dark-theme",displayName:"Dark Theme",page_background:{background_color:"#0f172a",background_image_url:"",page_layout:"center"},colors:{...o.colors,primary_button:"#3b82f6",primary_button_label:"#ffffff",base_hover_color:"#2563eb",body_text:"#e5e7eb",header:"#f3f4f6",input_background:"#1e293b",input_border:"#334155",input_filled_text:"#f3f4f6",input_labels_placeholders:"#94a3b8",widget_background:"#1e293b",widget_border:"#334155"},widget:{...o.widget,logo_url:"http://acmelogos.com/images/logo-5.svg"}},U={logo_url:"http://acmelogos.com/images/logo-5.svg",powered_by_logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},m={logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},l=e=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:e.map(n=>({id:`${n}-id`,name:n,strategy:n,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),oe={title:"Layouts/AuthLayout",component:r,parameters:{layout:"fullscreen"},tags:["autodocs"]},c={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email","google-oauth2"])}),t=r({title:"Sign In",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In",theme:o,branding:U}},u={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email","google-oauth2"])}),t=r({title:"Sign In - Left Aligned",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - Left Aligned",theme:q,branding:m}},h={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email","google-oauth2"])}),t=r({title:"Sign In - Right Aligned",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - Right Aligned",theme:E,branding:m}},b={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email","google-oauth2"])}),t=r({title:"Sign In - Gradient Background",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - Gradient Background",theme:$,branding:m}},p={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email"])}),t=r({title:"Sign In - Image Background",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - Image Background",theme:K,branding:m}},_={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email","google-oauth2"])}),t=r({title:"Sign In - Dark Theme",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - Dark Theme",theme:Q,branding:m}},f={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email"])}),t=r({title:"Sign In - No Logo",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - No Logo",theme:{...o,widget:{...o.widget,logo_position:"none"}},branding:m}},y={render:e=>{const n=g({theme:e.theme,branding:e.branding,loginSession:s,client:l(["email"])}),t=r({title:"Sign In - Layout Flexibility",theme:e.theme,branding:e.branding,children:n}).toString();return i.jsx(a,{html:t})},args:{title:"Sign In - Layout Flexibility",theme:o,branding:m}};var S,k,I;c.parameters={...c.parameters,docs:{...(S=c.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"])
    });
    const layout = AuthLayout({
      title: "Sign In",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In",
    theme: mockTheme,
    branding: mockBranding
  }
}`,...(I=(k=c.parameters)==null?void 0:k.docs)==null?void 0:I.source}}};var L,w,T;u.parameters={...u.parameters,docs:{...(L=u.parameters)==null?void 0:L.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"])
    });
    const layout = AuthLayout({
      title: "Sign In - Left Aligned",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Left Aligned",
    theme: leftLayoutTheme,
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(T=(w=u.parameters)==null?void 0:w.docs)==null?void 0:T.source}}};var B,F,x;h.parameters={...h.parameters,docs:{...(B=h.parameters)==null?void 0:B.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"])
    });
    const layout = AuthLayout({
      title: "Sign In - Right Aligned",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Right Aligned",
    theme: rightLayoutTheme,
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(x=(F=h.parameters)==null?void 0:F.docs)==null?void 0:x.source}}};var A,H,C;b.parameters={...b.parameters,docs:{...(A=b.parameters)==null?void 0:A.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"])
    });
    const layout = AuthLayout({
      title: "Sign In - Gradient Background",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Gradient Background",
    theme: gradientBackgroundTheme,
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(C=(H=b.parameters)==null?void 0:H.docs)==null?void 0:C.source}}};var M,D,P;p.parameters={...p.parameters,docs:{...(M=p.parameters)==null?void 0:M.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email"])
    });
    const layout = AuthLayout({
      title: "Sign In - Image Background",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Image Background",
    theme: imageBackgroundTheme,
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(P=(D=p.parameters)==null?void 0:D.docs)==null?void 0:P.source}}};var W,v,R;_.parameters={..._.parameters,docs:{...(W=_.parameters)==null?void 0:W.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"])
    });
    const layout = AuthLayout({
      title: "Sign In - Dark Theme",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Dark Theme",
    theme: darkTheme,
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(R=(v=_.parameters)==null?void 0:v.docs)==null?void 0:R.source}}};var N,j,O;f.parameters={...f.parameters,docs:{...(N=f.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: args => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email"])
    });
    const layout = AuthLayout({
      title: "Sign In - No Logo",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - No Logo",
    theme: {
      ...mockTheme,
      widget: {
        ...mockTheme.widget,
        logo_position: "none"
      }
    },
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(O=(j=f.parameters)==null?void 0:j.docs)==null?void 0:O.source}}};var z,J,X;y.parameters={...y.parameters,docs:{...(z=y.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: args => {
    // For MultipleComponents, we'll just show a single form
    // The original intent was to demonstrate layout flexibility,
    // but due to JSX runtime limitations, we keep it simple
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email"])
    });
    const layout = AuthLayout({
      title: "Sign In - Layout Flexibility",
      theme: args.theme,
      branding: args.branding,
      children: form
    });

    // Convert to HTML string
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Layout Flexibility",
    theme: mockTheme,
    branding: mockBrandingWithoutPoweredBy
  }
}`,...(X=(J=y.parameters)==null?void 0:J.docs)==null?void 0:X.source}}};const re=["CenterLayout","LeftLayout","RightLayout","GradientBackground","ImageBackground","DarkTheme","NoLogo","MultipleComponents"];export{c as CenterLayout,_ as DarkTheme,b as GradientBackground,p as ImageBackground,u as LeftLayout,y as MultipleComponents,f as NoLogo,h as RightLayout,re as __namedExportsOrder,oe as default};
