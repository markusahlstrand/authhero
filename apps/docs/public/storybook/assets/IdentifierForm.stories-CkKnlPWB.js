import{j as r}from"./jsx-runtime-BjG_zV1W.js";import{r as a,H as i,a as re}from"./AppLogo-gHPKz47t.js";import{I as n,A as te}from"./IdentifierForm-Da5JpXlw.js";import{d as se}from"./adapter-interfaces-DorHxuyG.js";import"./iframe-CdLQJ8ce.js";import"./preload-helper-C1FmrZbK.js";import"./button-D6b_BsBQ.js";import"./input-DLgZLdIf.js";import"./label-CL6wCMJg.js";import"./ErrorMessage-C_2KfqNY.js";import"./index-7QM1_TBj.js";const t={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:se.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},o={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#ffffff",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"http://acmelogos.com/images/logo-5.svg",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},k={logo_url:"http://acmelogos.com/images/logo-5.svg",powered_by_logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},ae={...o,themeId:"purple-theme",displayName:"Purple Theme",colors:{...o.colors,primary_button:"#7c3aed",primary_button_label:"#ffffff",base_hover_color:"#6d28d9",base_focus_color:"#7c3aed",links_focused_components:"#7c3aed",header:"#6d28d9",widget_background:"#faf5ff",widget_border:"#e9d5ff"}},ie={...o,themeId:"dark-theme",displayName:"Dark Theme",colors:{...o.colors,primary_button:"#3b82f6",primary_button_label:"#ffffff",base_hover_color:"#2563eb",body_text:"#e5e7eb",header:"#f3f4f6",input_background:"#1f2937",input_border:"#374151",input_filled_text:"#f3f4f6",input_labels_placeholders:"#9ca3af",widget_background:"#111827",widget_border:"#374151"}},le={...o,themeId:"pill-theme",displayName:"Pill Style Theme",borders:{...o.borders,button_border_radius:24,input_border_radius:24,widget_corner_radius:24,buttons_style:"pill",inputs_style:"pill"}},s=e=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:e.map(l=>({id:`${l}-id`,name:l,strategy:l,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),ye={title:"Components/IdentifierForm",component:n,parameters:{layout:"centered",backgrounds:{default:"light",values:[{name:"light",value:"#ffffff"},{name:"gray",value:"#f3f4f6"},{name:"dark",value:"#1f2937"}]}},tags:["autodocs"]},c={render:e=>{const l=a(n,e);return r.jsx(i,{html:l})},args:{theme:o,branding:k,loginSession:t,client:s(["email","google-oauth2"])}},m={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:o,branding:k,loginSession:t,client:s(["email"]),error:"Invalid email address",email:"test@example.com"}},d={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:ae,loginSession:t,client:s(["email","google-oauth2"])},parameters:{backgrounds:{default:"light"}}},g={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:ie,loginSession:t,client:s(["email","google-oauth2"])},parameters:{backgrounds:{default:"dark"}}},p={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:le,loginSession:t,client:s(["email"])}},u={render:e=>r.jsx(i,{html:a(n,e)}),args:{branding:{logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#ec4899"}},loginSession:t,client:s(["email","google-oauth2"])}},h={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:o,loginSession:t,client:s(["sms"])}},f={render:e=>{const l=a(n,e);return r.jsx(i,{html:l})},args:{loginSession:t,client:s(["email","google-oauth2"]),email:""}},_={render:e=>{const{theme:l,...ee}=e,oe=n(ee),ne=te({theme:l,title:"Login",children:oe}).toString();return r.jsx(re,{html:ne})},args:{theme:{...o,fonts:{...o.fonts,font_url:"https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"}},branding:{logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},loginSession:t,client:s(["email","google-oauth2"])},parameters:{docs:{description:{story:"This story demonstrates using a custom Google Font (Inter) via theme.fonts.font_url. The font is loaded in the AuthLayout <head> section and applied via CSS. Note: To load custom fonts, you need to use AuthLayout which includes the <head> section for loading external stylesheets."}}}},b={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:o,branding:k,loginSession:t,client:s(["email","google-oauth2","facebook","apple","github","microsoft"])},parameters:{docs:{description:{story:"This story demonstrates dynamically rendering multiple social login buttons based on available connections. The component now supports Google, Facebook, Apple, GitHub, Microsoft, and Vipps."}}}},S={render:e=>r.jsx(i,{html:a(n,e)}),args:{theme:o,branding:k,loginSession:t,client:s(["email","github","microsoft"])},parameters:{docs:{description:{story:"This story showcases GitHub and Microsoft authentication options, perfect for developer-focused applications."}}}};var y,w,T;c.parameters={...c.parameters,docs:{...(y=c.parameters)==null?void 0:y.docs,source:{originalSource:`{
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
}`,...(T=(w=c.parameters)==null?void 0:w.docs)==null?void 0:T.source}}};var I,C,x;m.parameters={...m.parameters,docs:{...(I=m.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
    error: "Invalid email address",
    email: "test@example.com"
  }
}`,...(x=(C=m.parameters)==null?void 0:C.docs)==null?void 0:x.source}}};var H,v,L;d.parameters={...d.parameters,docs:{...(H=d.parameters)==null?void 0:H.docs,source:{originalSource:`{
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
}`,...(L=(v=d.parameters)==null?void 0:v.docs)==null?void 0:L.source}}};var F,M,D;g.parameters={...g.parameters,docs:{...(F=g.parameters)==null?void 0:F.docs,source:{originalSource:`{
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
}`,...(D=(M=g.parameters)==null?void 0:M.docs)==null?void 0:D.source}}};var O,W,A;p.parameters={...p.parameters,docs:{...(O=p.parameters)==null?void 0:O.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: pillTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email"])
  }
}`,...(A=(W=p.parameters)==null?void 0:W.docs)==null?void 0:A.source}}};var j,J,P;u.parameters={...u.parameters,docs:{...(j=u.parameters)==null?void 0:j.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    branding: {
      logo_url: "http://acmelogos.com/images/logo-5.svg",
      colors: {
        primary: "#ec4899" // pink
      }
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(P=(J=u.parameters)==null?void 0:J.docs)==null?void 0:P.source}}};var X,G,z;h.parameters={...h.parameters,docs:{...(X=h.parameters)==null?void 0:X.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: mockTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"])
  }
}`,...(z=(G=h.parameters)==null?void 0:G.docs)==null?void 0:z.source}}};var N,B,E;f.parameters={...f.parameters,docs:{...(N=f.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: args => {
    const html = renderHonoComponent(IdentifierForm, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
    email: ""
  }
}`,...(E=(B=f.parameters)==null?void 0:B.docs)==null?void 0:E.source}}};var q,V,R;_.parameters={..._.parameters,docs:{...(q=_.parameters)==null?void 0:q.docs,source:{originalSource:`{
  render: args => {
    const {
      theme,
      ...formArgs
    } = args;
    const form = IdentifierForm(formArgs);
    const layout = AuthLayout({
      theme,
      title: "Login",
      children: form
    });
    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    theme: {
      ...mockTheme,
      fonts: {
        ...mockTheme.fonts,
        font_url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
      }
    },
    branding: {
      logo_url: "http://acmelogos.com/images/logo-5.svg",
      colors: {
        primary: "#0066cc"
      }
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  },
  parameters: {
    docs: {
      description: {
        story: "This story demonstrates using a custom Google Font (Inter) via theme.fonts.font_url. The font is loaded in the AuthLayout <head> section and applied via CSS. Note: To load custom fonts, you need to use AuthLayout which includes the <head> section for loading external stylesheets."
      }
    }
  }
}`,...(R=(V=_.parameters)==null?void 0:V.docs)==null?void 0:R.source}}};var $,K,Q;b.parameters={...b.parameters,docs:{...($=b.parameters)==null?void 0:$.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2", "facebook", "apple", "github", "microsoft"])
  },
  parameters: {
    docs: {
      description: {
        story: "This story demonstrates dynamically rendering multiple social login buttons based on available connections. The component now supports Google, Facebook, Apple, GitHub, Microsoft, and Vipps."
      }
    }
  }
}`,...(Q=(K=b.parameters)==null?void 0:K.docs)==null?void 0:Q.source}}};var U,Y,Z;S.parameters={...S.parameters,docs:{...(U=S.parameters)==null?void 0:U.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "github", "microsoft"])
  },
  parameters: {
    docs: {
      description: {
        story: "This story showcases GitHub and Microsoft authentication options, perfect for developer-focused applications."
      }
    }
  }
}`,...(Z=(Y=S.parameters)==null?void 0:Y.docs)==null?void 0:Z.source}}};const we=["Default","WithError","PurpleTheme","DarkTheme","PillStyle","BrandingOnly","PhoneOnly","NoTheming","CustomGoogleFont","MultipleSocialConnections","DeveloperSocialLogins"];export{u as BrandingOnly,_ as CustomGoogleFont,g as DarkTheme,c as Default,S as DeveloperSocialLogins,b as MultipleSocialConnections,f as NoTheming,h as PhoneOnly,p as PillStyle,d as PurpleTheme,m as WithError,we as __namedExportsOrder,ye as default};
