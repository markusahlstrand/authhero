import{d as E,r as i,a as o,H as t}from"./adapter-interfaces-DLDVgf18.js";import{I as n}from"./IdentifierForm-mO3k39iC.js";import"./iframe-ClqLvtKn.js";import"./preload-helper-C1FmrZbK.js";const a={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:E.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},r={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#ffffff",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"https://via.placeholder.com/150",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},B={logo_url:"https://via.placeholder.com/150",colors:{primary:"#0066cc"}},q={...r,themeId:"purple-theme",displayName:"Purple Theme",colors:{...r.colors,primary_button:"#7c3aed",primary_button_label:"#ffffff",base_hover_color:"#6d28d9",base_focus_color:"#7c3aed",links_focused_components:"#7c3aed",header:"#6d28d9",widget_background:"#faf5ff",widget_border:"#e9d5ff"}},A={...r,themeId:"dark-theme",displayName:"Dark Theme",colors:{...r.colors,primary_button:"#3b82f6",primary_button_label:"#ffffff",base_hover_color:"#2563eb",body_text:"#e5e7eb",header:"#f3f4f6",input_background:"#1f2937",input_border:"#374151",input_filled_text:"#f3f4f6",input_labels_placeholders:"#9ca3af",widget_background:"#111827",widget_border:"#374151"}},R={...r,themeId:"pill-theme",displayName:"Pill Style Theme",borders:{...r.borders,button_border_radius:24,input_border_radius:24,widget_corner_radius:24,buttons_style:"pill",inputs_style:"pill"}},s=e=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:e.map(l=>({id:`${l}-id`,name:l,strategy:l,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),U={title:"Components/IdentifierForm",component:n,parameters:{layout:"centered",backgrounds:{default:"light",values:[{name:"light",value:"#ffffff"},{name:"gray",value:"#f3f4f6"},{name:"dark",value:"#1f2937"}]}},tags:["autodocs"]},c={render:e=>{const l=i(n,e);return o.jsx(t,{html:l})},args:{theme:r,branding:B,loginSession:a,client:s(["email","google-oauth2"])}},d={render:e=>o.jsx(t,{html:i(n,e)}),args:{theme:r,branding:B,loginSession:a,client:s(["email"]),error:"Invalid email address",email:"test@example.com"}},m={render:e=>o.jsx(t,{html:i(n,e)}),args:{theme:q,loginSession:a,client:s(["email","google-oauth2"])},parameters:{backgrounds:{default:"light"}}},p={render:e=>o.jsx(t,{html:i(n,e)}),args:{theme:A,loginSession:a,client:s(["email","google-oauth2"])},parameters:{backgrounds:{default:"dark"}}},g={render:e=>o.jsx(t,{html:i(n,e)}),args:{theme:R,loginSession:a,client:s(["email"])}},u={render:e=>o.jsx(t,{html:i(n,e)}),args:{branding:{logo_url:"https://via.placeholder.com/150",colors:{primary:"#ec4899"}},loginSession:a,client:s(["email","google-oauth2"])}},_={render:e=>o.jsx(t,{html:i(n,e)}),args:{theme:r,loginSession:a,client:s(["sms"])}},h={render:e=>o.jsx(t,{children:o.jsx(n,{...e})}),args:{loginSession:a,client:s(["email","google-oauth2"]),email:""}};var f,b,k;c.parameters={...c.parameters,docs:{...(f=c.parameters)==null?void 0:f.docs,source:{originalSource:`{
  render: args => {
    const html = renderHonoComponent(IdentifierForm, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(k=(b=c.parameters)==null?void 0:b.docs)==null?void 0:k.source}}};var S,y,w;d.parameters={...d.parameters,docs:{...(S=d.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
    error: "Invalid email address",
    email: "test@example.com"
  }
}`,...(w=(y=d.parameters)==null?void 0:y.docs)==null?void 0:w.source}}};var x,I,T;m.parameters={...m.parameters,docs:{...(x=m.parameters)==null?void 0:x.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: purpleTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  },
  parameters: {
    backgrounds: {
      default: "light"
    }
  }
}`,...(T=(I=m.parameters)==null?void 0:I.docs)==null?void 0:T.source}}};var C,H,D;p.parameters={...p.parameters,docs:{...(C=p.parameters)==null?void 0:C.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: darkTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  },
  parameters: {
    backgrounds: {
      default: "dark"
    }
  }
}`,...(D=(H=p.parameters)==null?void 0:H.docs)==null?void 0:D.source}}};var O,v,M;g.parameters={...g.parameters,docs:{...(O=g.parameters)==null?void 0:O.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: pillTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email"])
  }
}`,...(M=(v=g.parameters)==null?void 0:v.docs)==null?void 0:M.source}}};var W,j,F;u.parameters={...u.parameters,docs:{...(W=u.parameters)==null?void 0:W.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    branding: {
      logo_url: "https://via.placeholder.com/150",
      colors: {
        primary: "#ec4899" // pink
      }
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(F=(j=u.parameters)==null?void 0:j.docs)==null?void 0:F.source}}};var J,X,L;_.parameters={..._.parameters,docs:{...(J=_.parameters)==null?void 0:J.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: mockTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"])
  }
}`,...(L=(X=_.parameters)==null?void 0:X.docs)==null?void 0:L.source}}};var P,z,N;h.parameters={...h.parameters,docs:{...(P=h.parameters)==null?void 0:P.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper>
      <IdentifierForm {...args} />
    </HonoJSXWrapper>,
  args: {
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
    email: ""
  }
}`,...(N=(z=h.parameters)==null?void 0:z.docs)==null?void 0:N.source}}};const V=["Default","WithError","PurpleTheme","DarkTheme","PillStyle","BrandingOnly","PhoneOnly","NoTheming"];export{u as BrandingOnly,p as DarkTheme,c as Default,h as NoTheming,_ as PhoneOnly,g as PillStyle,m as PurpleTheme,d as WithError,V as __namedExportsOrder,U as default};
