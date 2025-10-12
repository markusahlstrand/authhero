import{j as a}from"./jsx-runtime-BjG_zV1W.js";import{j as r,c as Y,A as jo,F as Ro,H as l,r as d}from"./AppLogo-gHPKz47t.js";import{i as n}from"./iframe-CdLQJ8ce.js";import{C as Bo,a as Io,b as Jo,c as Xo,d as Do,B as Z,e as Po}from"./button-D6b_BsBQ.js";import{L as oo}from"./label-CL6wCMJg.js";import{I as ro}from"./input-DLgZLdIf.js";import{E as Uo}from"./ErrorMessage-C_2KfqNY.js";import"./preload-helper-C1FmrZbK.js";const s=({error:e,theme:o,branding:t,state:w,email:v,className:Co,showCodeOption:ko=!0})=>{var z,W,F,$,E,j,R,B,I,J,X,D,P,U,A,T,M,q,V,G,K,Q;const h=((z=o==null?void 0:o.colors)==null?void 0:z.primary_button)||((W=t==null?void 0:t.colors)==null?void 0:W.primary)||"#0066cc",vo=((F=o==null?void 0:o.colors)==null?void 0:F.primary_button_label)||"#ffffff",c=(($=o==null?void 0:o.colors)==null?void 0:$.body_text)||"#333333",S=((E=o==null?void 0:o.colors)==null?void 0:E.input_border)||"#d1d5db",y=((j=o==null?void 0:o.colors)==null?void 0:j.widget_background)||"#ffffff",N=((R=o==null?void 0:o.colors)==null?void 0:R.widget_border)||"#e5e7eb",ho=((B=o==null?void 0:o.borders)==null?void 0:B.widget_corner_radius)||8,x=((I=o==null?void 0:o.borders)==null?void 0:I.button_border_radius)||4,So=((J=o==null?void 0:o.borders)==null?void 0:J.show_widget_shadow)??!0,No=((D=(X=o==null?void 0:o.fonts)==null?void 0:X.title)==null?void 0:D.size)||24,Ho=((U=(P=o==null?void 0:o.fonts)==null?void 0:P.title)==null?void 0:U.bold)??!0,C=((T=(A=o==null?void 0:o.fonts)==null?void 0:A.body_text)==null?void 0:T.size)||14,Lo={backgroundColor:y,borderColor:N,borderRadius:`${ho}px`,boxShadow:So?"0 1px 3px 0 rgba(0, 0, 0, 0.1)":"none",color:c},Oo={fontSize:`${No}px`,fontWeight:Ho?"700":"400",color:((M=o==null?void 0:o.colors)==null?void 0:M.header)||c},u={fontSize:`${C}px`,color:((q=o==null?void 0:o.colors)==null?void 0:q.input_labels_placeholders)||"#6b7280"},H={backgroundColor:h,color:vo,borderRadius:`${x}px`},zo={backgroundColor:((V=o==null?void 0:o.colors)==null?void 0:V.base_hover_color)||"#0052a3"},Wo={backgroundColor:"transparent",color:c,borderColor:S,borderRadius:`${x}px`},L={color:((G=o==null?void 0:o.colors)==null?void 0:G.links_focused_components)||h,fontSize:`${C}px`},O={borderColor:S,borderRadius:`${x}px`,fontSize:`${C}px`,color:c,backgroundColor:y},k=((K=o==null?void 0:o.widget)==null?void 0:K.logo_position)||"center",Fo=k==="left"?"text-left":k==="right"?"text-right":"text-center",$o=((Q=o==null?void 0:o.widget)==null?void 0:Q.logo_url)||(t==null?void 0:t.logo_url),Eo=k!=="none"&&$o;return r("div",{className:Y("flex flex-col gap-6 w-full max-w-sm",Co),children:r(Bo,{style:Lo,className:"border",children:[r(Io,{children:[Eo&&r("div",{className:Y("mb-4",Fo),children:r(jo,{theme:o,branding:t})}),r(Jo,{style:Oo,children:n.t("enter_password","Enter your password")}),r(Xo,{style:u,children:n.t("enter_password_description","Please enter your password to continue")})]}),r(Do,{children:r("form",{method:"post",children:r("div",{className:"space-y-4",children:[r("div",{className:"space-y-2",children:[r(oo,{htmlFor:"username",style:u,children:n.t("email","Email")}),r(ro,{type:"text",id:"username",name:"username",value:v,disabled:!0,style:O,className:"w-full bg-gray-50 dark:bg-gray-800"})]}),r("div",{className:"space-y-2",children:[r(oo,{htmlFor:"password",style:u,children:n.t("password","Password")}),r(ro,{type:"password",id:"password",name:"password",placeholder:n.t("enter_your_password","Enter your password"),required:!0,style:O,className:"w-full"})]}),e&&r(Uo,{children:e}),r(Z,{type:"submit",className:"w-full transition-colors",style:H,onmouseover:`this.style.backgroundColor='${zo.backgroundColor}'`,onmouseout:`this.style.backgroundColor='${H.backgroundColor}'`,children:n.t("login","Login")}),r("div",{className:"text-center",children:r("a",{href:`/u/forgot-password?state=${encodeURIComponent(w)}`,className:"text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors",style:L,children:n.t("forgot_password_link","Forgot password?")})}),ko&&r(Ro,{children:[r("div",{className:"relative",children:[r("div",{className:"absolute inset-0 flex items-center","aria-hidden":"true",children:r("div",{className:"w-full border-t",style:{borderColor:N}})}),r("div",{className:"relative flex justify-center text-xs uppercase",children:r("span",{className:"px-2",style:{backgroundColor:y,...u},children:n.t("or","Or")})})]}),r("form",{method:"post",action:`/u/login/identifier?state=${encodeURIComponent(w)}`,children:[r("input",{type:"hidden",name:"login_selection",value:"code"}),r("input",{type:"hidden",name:"username",value:v}),r(Z,{type:"submit",variant:"outline",className:"w-full transition-colors border",style:Wo,children:n.t("enter_a_code_btn","Email me a code instead")})]})]})]})})}),r(Po,{children:r("a",{href:`/u/login/identifier?state=${encodeURIComponent(w)}`,className:"text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors w-full text-center",style:L,children:n.t("go_back","Go back")})})]})})};s.__docgenInfo={description:"",methods:[],displayName:"LoginForm",props:{showCodeOption:{defaultValue:{value:"true",computed:!1},required:!1}}};const Yo={title:"Components/LoginForm",component:s,parameters:{layout:"centered"},tags:["autodocs"]},i={connections:[{name:"email",strategy:"email"},{name:"auth2",strategy:"Username-Password-Authentication"}]},p={args:{state:"example_state_123",email:"user@example.com",client:i,theme:null,branding:null,showCodeOption:!0},render:e=>a.jsx(l,{html:d(s,e)})},b={args:{state:"example_state_123",email:"user@example.com",client:i,theme:null,branding:null,showCodeOption:!0,error:"Invalid password. Please try again."},render:e=>a.jsx(l,{html:d(s,e)})},_={args:{state:"example_state_123",email:"user@example.com",client:i,theme:null,branding:null,showCodeOption:!1},render:e=>a.jsx(l,{html:d(s,e)})},g={args:{state:"example_state_123",email:"very.long.email.address@example-company.com",client:i,theme:null,branding:null,showCodeOption:!0},render:e=>a.jsx(l,{html:d(s,e)})},m={args:{state:"example_state_123",email:"user@example.com",client:i,theme:{colors:{primary_button:"#10b981",primary_button_label:"#ffffff",body_text:"#1f2937",widget_background:"#ffffff",widget_border:"#e5e7eb",header:"#111827",input_labels_placeholders:"#6b7280",input_border:"#d1d5db",base_hover_color:"#059669",links_focused_components:"#10b981"},fonts:{title:{bold:!0,size:28},body_text:{bold:!1,size:16}},borders:{widget_corner_radius:16,button_border_radius:8,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null,showCodeOption:!0},render:e=>a.jsx(l,{html:d(s,e)})},f={args:{state:"example_state_123",email:"user@example.com",client:i,theme:{colors:{primary_button:"#3b82f6",primary_button_label:"#ffffff",body_text:"#e5e7eb",widget_background:"#1f2937",widget_border:"#374151",header:"#f9fafb",input_labels_placeholders:"#9ca3af",input_border:"#4b5563",base_hover_color:"#2563eb",links_focused_components:"#60a5fa"},fonts:{title:{bold:!0,size:24},body_text:{bold:!1,size:14}},borders:{widget_corner_radius:8,button_border_radius:4,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null,showCodeOption:!0},parameters:{backgrounds:{default:"dark"}},render:e=>a.jsx(l,{html:`<div class="dark bg-gray-900 p-8">${d(s,e)}</div>`})};var eo,no,so;p.parameters={...p.parameters,docs:{...(eo=p.parameters)==null?void 0:eo.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    email: "user@example.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: true
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
}`,...(so=(no=p.parameters)==null?void 0:no.docs)==null?void 0:so.source}}};var to,ao,lo;b.parameters={...b.parameters,docs:{...(to=b.parameters)==null?void 0:to.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    email: "user@example.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: true,
    error: "Invalid password. Please try again."
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
}`,...(lo=(ao=b.parameters)==null?void 0:ao.docs)==null?void 0:lo.source}}};var io,co,uo;_.parameters={..._.parameters,docs:{...(io=_.parameters)==null?void 0:io.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    email: "user@example.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: false
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
}`,...(uo=(co=_.parameters)==null?void 0:co.docs)==null?void 0:uo.source}}};var po,bo,_o;g.parameters={...g.parameters,docs:{...(po=g.parameters)==null?void 0:po.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    email: "very.long.email.address@example-company.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: true
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
}`,...(_o=(bo=g.parameters)==null?void 0:bo.docs)==null?void 0:_o.source}}};var go,mo,fo;m.parameters={...m.parameters,docs:{...(go=m.parameters)==null?void 0:go.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    email: "user@example.com",
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
    branding: null,
    showCodeOption: true
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
}`,...(fo=(mo=m.parameters)==null?void 0:mo.docs)==null?void 0:fo.source}}};var wo,yo,xo;f.parameters={...f.parameters,docs:{...(wo=f.parameters)==null?void 0:wo.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    email: "user@example.com",
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
    branding: null,
    showCodeOption: true
  },
  parameters: {
    backgrounds: {
      default: "dark"
    }
  },
  render: args => <HonoJSXWrapper html={\`<div class="dark bg-gray-900 p-8">\${renderHonoComponent(LoginForm, args)}</div>\`} />
}`,...(xo=(yo=f.parameters)==null?void 0:yo.docs)==null?void 0:xo.source}}};const Zo=["Default","WithError","WithoutCodeOption","WithLongEmail","WithTheming","DarkMode"];export{f as DarkMode,p as Default,b as WithError,g as WithLongEmail,m as WithTheming,_ as WithoutCodeOption,Zo as __namedExportsOrder,Yo as default};
