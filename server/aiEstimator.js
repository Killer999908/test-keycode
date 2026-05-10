export function estimateProject(text){

text = text.toLowerCase();

let price = 0;
let time = "";
let type = "";


if(text.includes("ecommerce") || text.includes("shop")){

type = "Ecommerce Website";
price = 900;
time = "10 days";

}

else if(text.includes("portfolio")){

type = "Portfolio Website";
price = 300;
time = "4 days";

}

else if(text.includes("business")){

type = "Business Website";
price = 500;
time = "6 days";

}

else if(text.includes("mobile app")){

type = "Mobile App";
price = 2000;
time = "20 days";

}

else{

type = "Custom Project";
price = 400;
time = "7 days";

}

return {
type,
price,
time
};

}