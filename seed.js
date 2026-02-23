import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Fix MongoDB Atlas DNS (querySrv ECONNREFUSED)
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import { connectDB } from "./lib/db.js";
import bcrypt from "bcryptjs";
import { User } from "./models/User.js";
import { Job } from "./models/Job.js";

async function seed() {
  await connectDB();

  // Do NOT delete users here. We upsert driver users by email.
  const defaultPassword = "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  const driversToSeed = [
    {
      email: "giorgi@example.com",
      name: "გიორგი ბერიძე",
      location: "თბილისი",
      experience: "8 წელი",
      categories: ["C", "E", "CE"],
      rating: 4.9,
      bio: "ვარ გამოცდილი მძღოლი საერთაშორისო გადაზიდვების მიმართულებით.",
      verified: true,
      trips: 142,
      phone: "+995 555 12 34 56",
      workZone: "საერთაშორისო",
    },
    {
      email: "davit@example.com",
      name: "დავით კაპანაძე",
      location: "ქუთაისი",
      experience: "12 წელი",
      categories: ["C", "CE", "ADR"],
      rating: 5.0,
      bio: "დისტრიბუცია და რეგიონული რეისები.",
      verified: true,
      trips: 260,
      phone: "+995 555 22 33 44",
      workZone: "შიდა რეისი",
    },
    {
      email: "levan@example.com",
      name: "ლევან მჭედლიძე",
      location: "ბათუმი",
      experience: "5 წელი",
      categories: ["C", "E"],
      rating: 4.7,
      bio: "მაქვს გამოცდილება მაცივრიანი გადაზიდვებში.",
      verified: false,
      trips: 87,
      phone: "+995 555 77 88 99",
      workZone: "საერთაშორისო",
    },
  ];

  const driverUpserts = await Promise.all(
    driversToSeed.map(async (d) => {
      const doc = await User.findOneAndUpdate(
        { email: d.email },
        {
          $set: {
            email: d.email,
            name: d.name,
            role: "driver",
            passwordHash,
            location: d.location,
            experience: d.experience,
            categories: d.categories,
            rating: d.rating,
            bio: d.bio,
            verified: d.verified,
            trips: d.trips,
            phone: d.phone,
            workZone: d.workZone,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return doc;
    })
  );

  const ownerEmail = "owner@example.com";
  const owner = await User.findOneAndUpdate(
    { email: ownerEmail },
    {
      $set: {
        email: ownerEmail,
        name: "GeoTrans Owner",
        role: "owner",
        passwordHash,
        companyName: "GeoTrans Logistics",
        phone: "+995 555 99 88 77",
      },
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
  );

  // Jobs are safe to reset for demo.
  await Job.deleteMany({});

  const jobs = await Job.insertMany([
    {
      title: "სასწრაფოდ CE მძღოლი",
      route: "თბილისი - სტამბოლი",
      price: "1,200$",
      type: "საერთაშორისო",
      date: "22 თებ, 2026",
      description:
        "ვეძებთ გამოცდილ მძღოლს CE კატეგორიით. მანქანა არის 2022 წლის Scania. საწვავი და კვება ანაზღაურდება.",
      requirements: ["CE კატეგორია", "მინიმუმ 2 წლიანი გამოცდილება", "პუნქტუალურობა"],
      owner: owner.companyName || owner.name,
      phone: owner.phone,
      createdBy: owner._id,
    },
    {
      title: "სადისტრიბუციო მანქანა",
      route: "ქუთაისი - ბათუმი",
      price: "150₾ / დღე",
      type: "შიდა რეისი",
      date: "20 თებ, 2026",
      description: "საჭიროა მძღოლი სადისტრიბუციო მიმართულებით.",
      requirements: ["C კატეგორია", "თბილისის/რეგიონების ცოდნა"],
      owner: "FastCargo",
      phone: "+995 555 44 55 66",
    },
    {
      title: "მაცივარი (Ref)",
      route: "ფოთი - ერევანი",
      price: "800$",
      type: "საერთაშორისო",
      date: "25 თებ, 2026",
      description: "მაცივრიანი ტრანსპორტირება, სასურველია გამოცდილება REF-ით.",
      requirements: ["CE კატეგორია", "REF გამოცდილება"],
      owner: "BlackSea Trade",
      phone: "+995 555 90 80 70",
    },
  ]);

  console.log(
    `Seed complete: ${driverUpserts.length} driver users + 1 owner user (password: ${defaultPassword}), ${jobs.length} jobs`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed", err);
  process.exit(1);
});
