import{j as l}from"./jsx-runtime-BjG_zV1W.js";import{j as r,c as C,A as Ho,H as d,r as i}from"./AppLogo-gHPKz47t.js";import{i as n}from"./iframe-CdLQJ8ce.js";import{C as Wo,a as $o,b as Fo,c as Ro,d as Uo,B as jo,e as Bo}from"./button-D6b_BsBQ.js";import{L as G}from"./label-CL6wCMJg.js";import{I as Do}from"./input-DLgZLdIf.js";import{E as Lo}from"./ErrorMessage-C_2KfqNY.js";import"./preload-helper-C1FmrZbK.js";const s=({error:e,theme:o,branding:a,state:uo,user:_o,className:po})=>{var E,z,N,h,H,W,$,F,R,U,j,B,D,L,I,J,T,X,M,A,O,P,q;const k=((E=o==null?void 0:o.colors)==null?void 0:E.primary_button)||((z=a==null?void 0:a.colors)==null?void 0:z.primary)||"#0066cc",bo=((N=o==null?void 0:o.colors)==null?void 0:N.primary_button_label)||"#ffffff",t=((h=o==null?void 0:o.colors)==null?void 0:h.body_text)||"#333333",fo=((H=o==null?void 0:o.colors)==null?void 0:H.input_border)||"#d1d5db",v=((W=o==null?void 0:o.colors)==null?void 0:W.widget_background)||"#ffffff",go=(($=o==null?void 0:o.colors)==null?void 0:$.widget_border)||"#e5e7eb",mo=((F=o==null?void 0:o.borders)==null?void 0:F.widget_corner_radius)||8,y=((R=o==null?void 0:o.borders)==null?void 0:R.button_border_radius)||4,yo=((U=o==null?void 0:o.borders)==null?void 0:U.show_widget_shadow)??!0,wo=((B=(j=o==null?void 0:o.fonts)==null?void 0:j.title)==null?void 0:B.size)||24,xo=((L=(D=o==null?void 0:o.fonts)==null?void 0:D.title)==null?void 0:L.bold)??!0,_=((J=(I=o==null?void 0:o.fonts)==null?void 0:I.body_text)==null?void 0:J.size)||14,Co={backgroundColor:v,borderColor:go,borderRadius:`${mo}px`,boxShadow:yo?"0 1px 3px 0 rgba(0, 0, 0, 0.1)":"none",color:t},ko={fontSize:`${wo}px`,fontWeight:xo?"700":"400",color:((T=o==null?void 0:o.colors)==null?void 0:T.header)||t},w={fontSize:`${_}px`,color:((X=o==null?void 0:o.colors)==null?void 0:X.input_labels_placeholders)||"#6b7280"},S={backgroundColor:k,color:bo,borderRadius:`${y}px`},vo={backgroundColor:((M=o==null?void 0:o.colors)==null?void 0:M.base_hover_color)||"#0052a3"},So={color:((A=o==null?void 0:o.colors)==null?void 0:A.links_focused_components)||k,fontSize:`${_}px`},Eo={borderColor:e?"#ef4444":fo,borderRadius:`${y}px`,fontSize:`${_}px`,color:t,backgroundColor:v},x=((O=o==null?void 0:o.widget)==null?void 0:O.logo_position)||"center",zo=x==="left"?"text-left":x==="right"?"text-right":"text-center",No=((P=o==null?void 0:o.widget)==null?void 0:P.logo_url)||(a==null?void 0:a.logo_url),ho=x!=="none"&&No;return r("div",{className:C("flex flex-col gap-6 w-full max-w-sm",po),children:r(Wo,{style:Co,className:"border",children:[r($o,{children:[ho&&r("div",{className:C("mb-4",zo),children:r(Ho,{theme:o,branding:a})}),r(Fo,{style:ko,children:n.t("change_email","Change Email")}),r(Ro,{style:w,children:n.t("change_email_description","Update your email address")})]}),r(Uo,{children:r("div",{className:"space-y-4",children:[r("div",{className:"space-y-2",children:[r(G,{style:w,children:n.t("current_email","Current Email")}),r("div",{className:"p-3 bg-gray-50 dark:bg-gray-800 rounded-md",style:{borderRadius:`${y}px`},children:r("div",{className:"font-medium",style:{fontSize:`${_}px`,color:t},children:_o.email||n.t("no_email_address","No email address")})})]}),r("form",{method:"post",children:r("div",{className:"space-y-4",children:[r("div",{className:"space-y-2",children:[r(G,{htmlFor:"email",style:w,children:n.t("new_email","New Email")}),r(Do,{type:"email",id:"email",name:"email",placeholder:n.t("enter_new_email","Enter new email address"),required:!0,style:Eo,className:C("w-full",{"border-red-500":e})}),e&&r(Lo,{children:e})]}),r("div",{className:"flex gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md",children:[r("svg",{className:"w-5 h-5 flex-shrink-0 mt-0.5",fill:"currentColor",viewBox:"0 0 20 20",style:{color:((q=o==null?void 0:o.colors)==null?void 0:q.links_focused_components)||"#3b82f6"},children:r("path",{fillRule:"evenodd",d:"M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z",clipRule:"evenodd"})}),r("div",{className:"text-sm",style:{color:t},children:n.t("new_email_code_info","We'll send a verification code to your new email address")})]}),r(jo,{type:"submit",className:"w-full transition-colors",style:S,onmouseover:`this.style.backgroundColor='${vo.backgroundColor}'`,onmouseout:`this.style.backgroundColor='${S.backgroundColor}'`,children:n.t("continue","Continue")})]})})]})}),r(Bo,{children:r("a",{href:`/u/account?state=${encodeURIComponent(uo)}`,className:"text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors w-full text-center",style:So,children:n.t("go_back","Go back")})})]})})};s.__docgenInfo={description:"",methods:[],displayName:"ChangeEmailForm"};const qo={title:"Components/ChangeEmailForm",component:s,parameters:{layout:"centered"},tags:["autodocs"]},c={email:"user@example.com",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),user_id:"auth2|user_123",provider:"auth2",connection:"Username-Password-Authentication",is_social:!1,email_verified:!0,login_count:15},u={client_id:"client_123",connections:[{name:"email",strategy:"email"}]},p={args:{state:"example_state_123",user:c,client:u,theme:null,branding:null},render:e=>l.jsx(d,{html:i(s,e)})},b={args:{state:"example_state_123",user:c,client:u,theme:null,branding:null,error:"This email address is already in use."},render:e=>l.jsx(d,{html:i(s,e)})},f={args:{state:"example_state_123",user:{...c,email:"very.long.current.email.address@example-company-domain.com"},client:u,theme:null,branding:null},render:e=>l.jsx(d,{html:i(s,e)})},g={args:{state:"example_state_123",user:c,client:u,theme:{colors:{primary_button:"#10b981",primary_button_label:"#ffffff",body_text:"#1f2937",widget_background:"#ffffff",widget_border:"#e5e7eb",header:"#111827",input_labels_placeholders:"#6b7280",input_border:"#d1d5db",base_hover_color:"#059669",links_focused_components:"#10b981"},fonts:{title:{bold:!0,size:28},body_text:{bold:!1,size:16}},borders:{widget_corner_radius:16,button_border_radius:8,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null},render:e=>l.jsx(d,{html:i(s,e)})},m={args:{state:"example_state_123",user:c,client:u,theme:{colors:{primary_button:"#3b82f6",primary_button_label:"#ffffff",body_text:"#e5e7eb",widget_background:"#1f2937",widget_border:"#374151",header:"#f9fafb",input_labels_placeholders:"#9ca3af",input_border:"#4b5563",base_hover_color:"#2563eb",links_focused_components:"#60a5fa"},fonts:{title:{bold:!0,size:24},body_text:{bold:!1,size:14}},borders:{widget_corner_radius:8,button_border_radius:4,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null},parameters:{backgrounds:{default:"dark"}},render:e=>l.jsx(d,{html:`<div class="dark bg-gray-900 p-8">${i(s,e)}</div>`})};var V,K,Q;p.parameters={...p.parameters,docs:{...(V=p.parameters)==null?void 0:V.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
}`,...(Q=(K=p.parameters)==null?void 0:K.docs)==null?void 0:Q.source}}};var Y,Z,oo;b.parameters={...b.parameters,docs:{...(Y=b.parameters)==null?void 0:Y.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    error: "This email address is already in use."
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
}`,...(oo=(Z=b.parameters)==null?void 0:Z.docs)==null?void 0:oo.source}}};var ro,eo,no;f.parameters={...f.parameters,docs:{...(ro=f.parameters)==null?void 0:ro.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "very.long.current.email.address@example-company-domain.com"
    },
    client: mockClient,
    theme: null,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
}`,...(no=(eo=f.parameters)==null?void 0:eo.docs)==null?void 0:no.source}}};var ao,so,to;g.parameters={...g.parameters,docs:{...(ao=g.parameters)==null?void 0:ao.docs,source:{originalSource:`{
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
        input_border: "#d1d5db",
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
  render: args => <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
}`,...(to=(so=g.parameters)==null?void 0:so.docs)==null?void 0:to.source}}};var lo,io,co;m.parameters={...m.parameters,docs:{...(lo=m.parameters)==null?void 0:lo.docs,source:{originalSource:`{
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
        input_border: "#4b5563",
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
  render: args => <HonoJSXWrapper html={\`<div class="dark bg-gray-900 p-8">\${renderHonoComponent(ChangeEmailForm, args)}</div>\`} />
}`,...(co=(io=m.parameters)==null?void 0:io.docs)==null?void 0:co.source}}};const Go=["Default","WithError","WithLongCurrentEmail","WithTheming","DarkMode"];export{m as DarkMode,p as Default,b as WithError,f as WithLongCurrentEmail,g as WithTheming,Go as __namedExportsOrder,qo as default};
