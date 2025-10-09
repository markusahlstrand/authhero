import{c as le,j as a,d as ce,r as c,a as e,H as d}from"./adapter-interfaces-DLDVgf18.js";import{h as de}from"./index-CvWD-_Qu.js";import{I as m}from"./IdentifierForm-mO3k39iC.js";import"./iframe-ClqLvtKn.js";import"./preload-helper-C1FmrZbK.js";var v=Object.freeze,me=Object.defineProperty,ge=(o,l)=>v(me(o,"raw",{value:v(o.slice())})),j;const ue="https://assets.sesamy.com/images/login-bg.jpg",s=({title:o,children:l,theme:n,branding:i})=>{var x,L,C,T;const u=((x=n==null?void 0:n.page_background)==null?void 0:x.page_layout)||"center",re=((L=n==null?void 0:n.page_background)==null?void 0:L.background_color)||"#ffffff",ae=((C=n==null?void 0:n.page_background)==null?void 0:C.background_image_url)||ue,ie=le("min-h-screen w-full flex p-6 md:p-10 bg-cover bg-center",{center:"items-center justify-center",left:"items-center justify-start",right:"items-center justify-end"}[u]),se={backgroundImage:`url(${ae})`,backgroundColor:re};return a("html",{lang:"en",children:[a("head",{children:[a("title",{children:o}),a("meta",{charset:"UTF-8"}),a("meta",{name:"robots",content:"noindex, follow"}),a("link",{rel:"stylesheet",href:"/u/css/tailwind.css"}),a("link",{rel:"stylesheet",href:"/u/css/shadcn-ui.css"}),a("meta",{name:"viewport",content:"width=device-width, initial-scale=1, maximum-scale=1"}),a("meta",{name:"theme-color",content:"#000000"}),(i==null?void 0:i.favicon_url)&&a("link",{rel:"icon",type:"image/x-icon",href:i.favicon_url}),((T=n==null?void 0:n.fonts)==null?void 0:T.font_url)&&a("link",{rel:"stylesheet",href:n.fonts.font_url})]}),a("body",{children:a("div",{className:ie,style:se,children:a("div",{className:"w-full max-w-sm",children:l})})}),de(j||(j=ge([`
        <script>
          // Add loading class to submit button on form submission
          document.addEventListener("DOMContentLoaded", function () {
            var forms = document.querySelectorAll("form");
            forms.forEach(function (form) {
              var submitBtn = form.querySelector("button[type=submit]");
              if (submitBtn) {
                form.onsubmit = function () {
                  submitBtn.classList.add("is-loading");
                  submitBtn.disabled = true;
                };
                // Remove loading class if the page is loaded from browser bfcache
                window.addEventListener("pageshow", function (event) {
                  if (event.persisted) {
                    submitBtn.classList.remove("is-loading");
                    submitBtn.disabled = false;
                  }
                });
              }
            });
          });
        <\/script>
      `])))]})};s.__docgenInfo={description:`AuthLayout - A responsive layout component for authentication pages
Supports three layout modes based on theme.page_background.page_layout:
- center: Centers the content (default)
- left: Aligns content to the left
- right: Aligns content to the right`,methods:[],displayName:"AuthLayout"};const g={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:ce.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},t={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#f3f4f6",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"https://via.placeholder.com/200x60/0066cc/ffffff?text=AuthHero",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},I={...t,themeId:"left-layout",displayName:"Left Layout Theme",page_background:{...t.page_background,page_layout:"left"},widget:{...t.widget,logo_position:"left"}},B={...t,themeId:"right-layout",displayName:"Right Layout Theme",page_background:{...t.page_background,page_layout:"right"},widget:{...t.widget,logo_position:"right"}},A={...t,themeId:"gradient-bg",displayName:"Gradient Background Theme",page_background:{background_color:"#7c3aed",background_image_url:"",page_layout:"center"},colors:{...t.colors,primary_button:"#7c3aed",base_hover_color:"#6d28d9"}},M={...t,themeId:"image-bg",displayName:"Image Background Theme",page_background:{background_color:"#1f2937",background_image_url:"https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&h=1080&fit=crop",page_layout:"center"},colors:{...t.colors,widget_background:"rgba(255, 255, 255, 0.95)"}},H={...t,themeId:"dark-theme",displayName:"Dark Theme",page_background:{background_color:"#0f172a",background_image_url:"",page_layout:"center"},colors:{...t.colors,primary_button:"#3b82f6",primary_button_label:"#ffffff",base_hover_color:"#2563eb",body_text:"#e5e7eb",header:"#f3f4f6",input_background:"#1e293b",input_border:"#334155",input_filled_text:"#f3f4f6",input_labels_placeholders:"#94a3b8",widget_background:"#1e293b",widget_border:"#334155"},widget:{...t.widget,logo_url:"https://via.placeholder.com/200x60/3b82f6/ffffff?text=AuthHero"}},p={logo_url:"https://via.placeholder.com/200x60/ec4899/ffffff?text=MyBrand",colors:{primary:"#ec4899"}},r=o=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:o.map(l=>({id:`${l}-id`,name:l,strategy:l,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),ye={title:"Layouts/AuthLayout",component:s,parameters:{layout:"fullscreen"},tags:["autodocs"]},h={render:o=>{const{children:l,...n}=o,i=c(u=>e.jsx(s,{...u,children:e.jsx(m,{theme:t,branding:p,loginSession:g,client:r(["email","google-oauth2"])})}),n);return e.jsx(d,{html:i})},args:{theme:t,branding:p,client:r(["email","google-oauth2"])}},_={render:o=>{const{children:l,...n}=o,i=c(u=>e.jsx(s,{...u,children:e.jsx(m,{theme:I,branding:p,loginSession:g,client:r(["email","google-oauth2"])})}),n);return e.jsx(d,{html:i})},args:{theme:I,branding:p,client:r(["email","google-oauth2"])}},f={render:o=>{const{children:l,...n}=o,i=c(u=>e.jsx(s,{...u,children:e.jsx(m,{theme:B,branding:p,loginSession:g,client:r(["email","google-oauth2"])})}),n);return e.jsx(d,{html:i})},args:{theme:B,branding:p,client:r(["email","google-oauth2"])}},b={render:o=>e.jsx(d,{html:c(s,o)}),args:{theme:A,client:r(["email","google-oauth2"]),children:e.jsx(m,{theme:A,loginSession:g,client:r(["email","google-oauth2"])})}},k={render:o=>e.jsx(d,{html:c(s,o)}),args:{theme:M,client:r(["email"]),children:e.jsx(m,{theme:M,loginSession:g,client:r(["email"])})}},y={render:o=>e.jsx(d,{html:c(s,o)}),args:{theme:H,client:r(["email","google-oauth2"]),children:e.jsx(m,{theme:H,loginSession:g,client:r(["email","google-oauth2"])})}},S={render:o=>e.jsx(d,{html:c(s,o)}),args:{theme:{...t,widget:{...t.widget,logo_position:"none"}},client:r(["email"]),children:e.jsx(m,{theme:{...t,widget:{...t.widget,logo_position:"none"}},loginSession:g,client:r(["email"])})}},w={render:o=>e.jsx(d,{html:c(s,o)}),args:{theme:t,client:r(["email"]),children:e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{marginBottom:"2rem"},children:e.jsx(m,{theme:t,loginSession:g,client:r(["email"])})}),e.jsx("div",{style:{textAlign:"center",color:"#6b7280",fontSize:"14px"},children:e.jsx("p",{children:"You could add multiple components here"})})]})}};var D,O,z;h.parameters={...h.parameters,docs:{...(D=h.parameters)==null?void 0:D.docs,source:{originalSource:`{
  render: args => {
    const {
      children,
      ...layoutProps
    } = args;
    const html = renderHonoComponent((props: any) => <AuthLayout {...props}>
          <IdentifierForm theme={mockTheme} branding={mockBranding} loginSession={mockLoginSession} client={createMockClient(["email", "google-oauth2"])} />
        </AuthLayout>, layoutProps);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: mockTheme,
    branding: mockBranding,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(z=(O=h.parameters)==null?void 0:O.docs)==null?void 0:z.source}}};var F,P,N;_.parameters={..._.parameters,docs:{...(F=_.parameters)==null?void 0:F.docs,source:{originalSource:`{
  render: args => {
    const {
      children,
      ...layoutProps
    } = args;
    const html = renderHonoComponent((props: any) => <AuthLayout {...props}>
          <IdentifierForm theme={leftLayoutTheme} branding={mockBranding} loginSession={mockLoginSession} client={createMockClient(["email", "google-oauth2"])} />
        </AuthLayout>, layoutProps);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: leftLayoutTheme,
    branding: mockBranding,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(N=(P=_.parameters)==null?void 0:P.docs)==null?void 0:N.source}}};var J,W,X;f.parameters={...f.parameters,docs:{...(J=f.parameters)==null?void 0:J.docs,source:{originalSource:`{
  render: args => {
    const {
      children,
      ...layoutProps
    } = args;
    const html = renderHonoComponent((props: any) => <AuthLayout {...props}>
          <IdentifierForm theme={rightLayoutTheme} branding={mockBranding} loginSession={mockLoginSession} client={createMockClient(["email", "google-oauth2"])} />
        </AuthLayout>, layoutProps);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: rightLayoutTheme,
    branding: mockBranding,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(X=(W=f.parameters)==null?void 0:W.docs)==null?void 0:X.source}}};var E,q,R;b.parameters={...b.parameters,docs:{...(E=b.parameters)==null?void 0:E.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(AuthLayout, args)} />,
  args: {
    theme: gradientBackgroundTheme,
    client: createMockClient(["email", "google-oauth2"]),
    children: <IdentifierForm theme={gradientBackgroundTheme} loginSession={mockLoginSession} client={createMockClient(["email", "google-oauth2"])} />
  }
}`,...(R=(q=b.parameters)==null?void 0:q.docs)==null?void 0:R.source}}};var G,U,Y;k.parameters={...k.parameters,docs:{...(G=k.parameters)==null?void 0:G.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(AuthLayout, args)} />,
  args: {
    theme: imageBackgroundTheme,
    client: createMockClient(["email"]),
    children: <IdentifierForm theme={imageBackgroundTheme} loginSession={mockLoginSession} client={createMockClient(["email"])} />
  }
}`,...(Y=(U=k.parameters)==null?void 0:U.docs)==null?void 0:Y.source}}};var $,V,K;y.parameters={...y.parameters,docs:{...($=y.parameters)==null?void 0:$.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(AuthLayout, args)} />,
  args: {
    theme: darkTheme,
    client: createMockClient(["email", "google-oauth2"]),
    children: <IdentifierForm theme={darkTheme} loginSession={mockLoginSession} client={createMockClient(["email", "google-oauth2"])} />
  }
}`,...(K=(V=y.parameters)==null?void 0:V.docs)==null?void 0:K.source}}};var Q,Z,ee;S.parameters={...S.parameters,docs:{...(Q=S.parameters)==null?void 0:Q.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(AuthLayout, args)} />,
  args: {
    theme: {
      ...mockTheme,
      widget: {
        ...mockTheme.widget,
        logo_position: "none"
      }
    },
    client: createMockClient(["email"]),
    children: <IdentifierForm theme={{
      ...mockTheme,
      widget: {
        ...mockTheme.widget,
        logo_position: "none"
      }
    }} loginSession={mockLoginSession} client={createMockClient(["email"])} />
  }
}`,...(ee=(Z=S.parameters)==null?void 0:Z.docs)==null?void 0:ee.source}}};var oe,te,ne;w.parameters={...w.parameters,docs:{...(oe=w.parameters)==null?void 0:oe.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(AuthLayout, args)} />,
  args: {
    theme: mockTheme,
    client: createMockClient(["email"]),
    children: <>
        <div style={{
        marginBottom: "2rem"
      }}>
          <IdentifierForm theme={mockTheme} loginSession={mockLoginSession} client={createMockClient(["email"])} />
        </div>
        <div style={{
        textAlign: "center",
        color: "#6b7280",
        fontSize: "14px"
      }}>
          <p>You could add multiple components here</p>
        </div>
      </>
  }
}`,...(ne=(te=w.parameters)==null?void 0:te.docs)==null?void 0:ne.source}}};const Se=["CenterLayout","LeftLayout","RightLayout","GradientBackground","ImageBackground","DarkTheme","NoLogo","MultipleComponents"];export{h as CenterLayout,y as DarkTheme,b as GradientBackground,k as ImageBackground,_ as LeftLayout,w as MultipleComponents,S as NoLogo,f as RightLayout,Se as __namedExportsOrder,ye as default};
