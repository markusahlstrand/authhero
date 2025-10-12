import{j as c}from"./jsx-runtime-BjG_zV1W.js";import{j as n,c as A,A as yo,H as d,r as u}from"./AppLogo-gHPKz47t.js";import{i as s}from"./iframe-CdLQJ8ce.js";import{C as xo,a as Co,b as ko,c as So,d as vo,B as zo}from"./button-D6b_BsBQ.js";import{T as Ho}from"./Trans-DadTjdpm.js";import"./preload-helper-C1FmrZbK.js";const e=({theme:o,branding:r,state:h,user:oo,className:no})=>{var y,x,C,k,S,v,z,H,N,W,$,j,D,U,B,F,R,T,J,X,I;const f=((y=o==null?void 0:o.colors)==null?void 0:y.primary_button)||((x=r==null?void 0:r.colors)==null?void 0:x.primary)||"#0066cc",ro=((C=o==null?void 0:o.colors)==null?void 0:C.primary_button_label)||"#ffffff",g=((k=o==null?void 0:o.colors)==null?void 0:k.body_text)||"#333333",eo=((S=o==null?void 0:o.colors)==null?void 0:S.widget_background)||"#ffffff",so=((v=o==null?void 0:o.colors)==null?void 0:v.widget_border)||"#e5e7eb",to=((z=o==null?void 0:o.borders)==null?void 0:z.widget_corner_radius)||8,ao=((H=o==null?void 0:o.borders)==null?void 0:H.button_border_radius)||4,lo=((N=o==null?void 0:o.borders)==null?void 0:N.show_widget_shadow)??!0,io=(($=(W=o==null?void 0:o.fonts)==null?void 0:W.title)==null?void 0:$.size)||24,co=((D=(j=o==null?void 0:o.fonts)==null?void 0:j.title)==null?void 0:D.bold)??!0,m=((B=(U=o==null?void 0:o.fonts)==null?void 0:U.body_text)==null?void 0:B.size)||14,uo={backgroundColor:eo,borderColor:so,borderRadius:`${to}px`,boxShadow:lo?"0 1px 3px 0 rgba(0, 0, 0, 0.1)":"none",color:g},_o={fontSize:`${io}px`,fontWeight:co?"700":"400",color:((F=o==null?void 0:o.colors)==null?void 0:F.header)||g},bo={fontSize:`${m}px`,color:((R=o==null?void 0:o.colors)==null?void 0:R.input_labels_placeholders)||"#6b7280"},w={backgroundColor:f,color:ro,borderRadius:`${ao}px`},po={backgroundColor:((T=o==null?void 0:o.colors)==null?void 0:T.base_hover_color)||"#0052a3"},fo={color:((J=o==null?void 0:o.colors)==null?void 0:J.links_focused_components)||f,fontSize:`${m}px`},p=((X=o==null?void 0:o.widget)==null?void 0:X.logo_position)||"center",go=p==="left"?"text-left":p==="right"?"text-right":"text-center",mo=((I=o==null?void 0:o.widget)==null?void 0:I.logo_url)||(r==null?void 0:r.logo_url),wo=p!=="none"&&mo;return n("div",{className:A("flex flex-col gap-6 w-full max-w-sm",no),children:n(xo,{style:uo,className:"border",children:[n(Co,{children:[wo&&n("div",{className:A("mb-4",go),children:n(yo,{theme:o,branding:r})}),n(ko,{style:_o,children:s.t("continue_with_account","Continue with account")}),n(So,{style:bo,children:[n(Ho,{i18nKey:"currently_logged_in_as",components:[n("span",{className:"font-semibold"},"span")],values:{email:oo.email||""}}),n("br",{}),n("br",{}),s.t("continue_with_sso_provider_headline","Do you want to continue with this account?")]})]}),n(vo,{children:n("form",{method:"post",children:n("div",{className:"grid gap-4",children:[n(zo,{type:"submit",className:"w-full transition-colors",style:w,onmouseover:`this.style.backgroundColor='${po.backgroundColor}'`,onmouseout:`this.style.backgroundColor='${w.backgroundColor}'`,children:s.t("yes_continue_with_existing_account","Yes, continue")}),n("div",{className:"text-center",children:n("a",{href:`/u/login/identifier?state=${encodeURIComponent(h)}`,className:"text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors",style:fo,children:s.t("no_use_another","No, use another account")})})]})})})]})})};e.__docgenInfo={description:"",methods:[],displayName:"ContinueForm"};const Bo={title:"Components/ContinueForm",component:e,parameters:{layout:"centered"},tags:["autodocs"]},_={email:"john.doe@example.com",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),user_id:"user_123",provider:"email",connection:"email",is_social:!1,email_verified:!0,login_count:5},b={connections:[{name:"email",strategy:"email"}]},t={args:{state:"example_state_123",user:_,client:b,theme:null,branding:null},render:o=>c.jsx(d,{html:u(e,o)})},a={args:{state:"example_state_123",user:{..._,email:"custom.user@company.com"},client:b,theme:null,branding:null},render:o=>c.jsx(d,{html:u(e,o)})},l={args:{state:"example_state_123",user:_,client:b,theme:{colors:{primary_button:"#10b981",primary_button_label:"#ffffff",body_text:"#1f2937",widget_background:"#ffffff",widget_border:"#e5e7eb",header:"#111827",input_labels_placeholders:"#6b7280",base_hover_color:"#059669",links_focused_components:"#10b981"},fonts:{title:{bold:!0,size:28},body_text:{bold:!1,size:16}},borders:{widget_corner_radius:16,button_border_radius:8,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null},render:o=>c.jsx(d,{html:u(e,o)})},i={args:{state:"example_state_123",user:_,client:b,theme:{colors:{primary_button:"#3b82f6",primary_button_label:"#ffffff",body_text:"#e5e7eb",widget_background:"#1f2937",widget_border:"#374151",header:"#f9fafb",input_labels_placeholders:"#9ca3af",base_hover_color:"#2563eb",links_focused_components:"#60a5fa"},fonts:{title:{bold:!0,size:24},body_text:{bold:!1,size:14}},borders:{widget_corner_radius:8,button_border_radius:4,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null},parameters:{backgrounds:{default:"dark"}},render:o=>c.jsx(d,{html:`<div class="dark bg-gray-900 p-8">${u(e,o)}</div>`})};var E,L,O;t.parameters={...t.parameters,docs:{...(E=t.parameters)==null?void 0:E.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ContinueForm, args)} />
}`,...(O=(L=t.parameters)==null?void 0:L.docs)==null?void 0:O.source}}};var M,K,P;a.parameters={...a.parameters,docs:{...(M=a.parameters)==null?void 0:M.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "custom.user@company.com"
    },
    client: mockClient,
    theme: null,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ContinueForm, args)} />
}`,...(P=(K=a.parameters)==null?void 0:K.docs)==null?void 0:P.source}}};var V,Y,q;l.parameters={...l.parameters,docs:{...(V=l.parameters)==null?void 0:V.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#10b981",
        primary_button_label: "#ffffff",
        body_text: "#1f2937",
        widget_background: "#ffffff",
        widget_border: "#e5e7eb",
        header: "#111827",
        input_labels_placeholders: "#6b7280",
        base_hover_color: "#059669",
        links_focused_components: "#10b981"
      },
      fonts: {
        title: {
          bold: true,
          size: 28
        },
        body_text: {
          bold: false,
          size: 16
        }
      },
      borders: {
        widget_corner_radius: 16,
        button_border_radius: 8,
        show_widget_shadow: true
      },
      widget: {
        logo_position: "center"
      }
    } as any,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ContinueForm, args)} />
}`,...(q=(Y=l.parameters)==null?void 0:Y.docs)==null?void 0:q.source}}};var G,Q,Z;i.parameters={...i.parameters,docs:{...(G=i.parameters)==null?void 0:G.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#3b82f6",
        primary_button_label: "#ffffff",
        body_text: "#e5e7eb",
        widget_background: "#1f2937",
        widget_border: "#374151",
        header: "#f9fafb",
        input_labels_placeholders: "#9ca3af",
        base_hover_color: "#2563eb",
        links_focused_components: "#60a5fa"
      },
      fonts: {
        title: {
          bold: true,
          size: 24
        },
        body_text: {
          bold: false,
          size: 14
        }
      },
      borders: {
        widget_corner_radius: 8,
        button_border_radius: 4,
        show_widget_shadow: true
      },
      widget: {
        logo_position: "center"
      }
    } as any,
    branding: null
  },
  parameters: {
    backgrounds: {
      default: "dark"
    }
  },
  render: args => <HonoJSXWrapper html={\`<div class="dark bg-gray-900 p-8">\${renderHonoComponent(ContinueForm, args)}</div>\`} />
}`,...(Z=(Q=i.parameters)==null?void 0:Q.docs)==null?void 0:Z.source}}};const Fo=["Default","WithCustomUser","WithTheming","DarkMode"];export{i as DarkMode,t as Default,a as WithCustomUser,l as WithTheming,Fo as __namedExportsOrder,Bo as default};
